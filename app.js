const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = 'siglv-state-v3';

const STAGES = [
  'AGENDADO',
  'PORTARIA',
  'PESAGEM',
  'PATIO',
  'DOCA',
  'OPERACAO',
  'CONFERENCIA',
  'LIBERADO',
  'FINALIZADO'
];

const VEHICLES = [
  'VUC',
  'Toco',
  'Truck',
  'Carreta',
  'Bitrem',
  'Rodotrem'
];

const minutesToClock = (minutes) => {
  const m = Math.max(0, Math.round(minutes));

  return `${String(Math.floor(m / 60)).padStart(
    2,
    '0'
  )}:${String(m % 60).padStart(2, '0')}`;
};

const timeToMinutes = (value) => {
  const [h, m] = String(value || '00:00')
    .split(':')
    .map(Number);

  return h * 60 + m;
};

const nowClock = () =>
  new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const uid = () =>
  Date.now() + Math.floor(Math.random() * 100000);

/* =========================================================
   DADOS INICIAIS
========================================================= */

function defaultState() {
  return {
    trucks: [
      {
        id: 1,
        placa: 'ABC1D23',
        motorista: 'Carlos Silva',
        transportadora: 'TransCaí',
        vehicle: 'Carreta',
        cargo: 'Matéria-prima',
        weight: 28000,
        qty: 24,
        operation: 'Descarga',
        date: '2026-08-13',
        time: '08:00',
        status: 'OPERACAO',
        dock: 3,
        entry: '08:03',
        stageStart: Date.now() - 42 * 60000
      },

      {
        id: 2,
        placa: 'DEF4G56',
        motorista: 'Marcos Souza',
        transportadora: 'Vale Log',
        vehicle: 'Truck',
        cargo: 'Carga paletizada',
        weight: 16000,
        qty: 18,
        operation: 'Carga',
        date: '2026-08-13',
        time: '08:30',
        status: 'PATIO',
        entry: '08:31',
        stageStart: Date.now() - 13 * 60000
      },

      {
        id: 3,
        placa: 'GHI7J89',
        motorista: 'Rafael Lima',
        transportadora: 'Serra Transportes',
        vehicle: 'Carreta',
        cargo: 'Produto acabado',
        weight: 24000,
        qty: 30,
        operation: 'Carga',
        date: '2026-08-13',
        time: '09:00',
        status: 'AGENDADO'
      },

      {
        id: 4,
        placa: 'JKL2M34',
        motorista: 'João Pereira',
        transportadora: 'Sul Cargo',
        vehicle: 'Bitrem',
        cargo: 'Embalagens',
        weight: 32000,
        qty: 40,
        operation: 'Descarga',
        date: '2026-08-13',
        time: '09:30',
        status: 'PESAGEM',
        entry: '09:27',
        stageStart: Date.now() - 8 * 60000
      },

      {
        id: 5,
        placa: 'NOP5Q67',
        motorista: 'Lucas Costa',
        transportadora: 'Log Vale',
        vehicle: 'Truck',
        cargo: 'Produto acabado',
        weight: 14500,
        qty: 16,
        operation: 'Carga',
        date: '2026-08-13',
        time: '10:00',
        status: 'LIBERADO',
        entry: '09:58',
        stageStart: Date.now() - 2 * 60000
      }
    ],

    docks: Array.from(
      {
        length: 8
      },
      (_, index) => ({
        id: index + 1,
        truckId: index === 2 ? 1 : null
      })
    ),

    alerts: [],

    history: [],

    scenarios: [],

    settings: {
      dockCount: 8,
      scaleCount: 2,
      yardCapacity: 25,
      forklifts: 4,
      gateCount: 1,

      stageLimits: {
        PORTARIA: 5,
        PESAGEM: 10,
        PATIO: 15,
        CARGA: 30,
        DESCARGA: 35,
        CONFERENCIA: 10
      }
    },

    sim: null
  };
}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadState() {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return defaultState();
    }

    const parsed = JSON.parse(saved);
    const base = defaultState();

    return {
      ...base,
      ...parsed,

      settings: {
        ...base.settings,
        ...(parsed.settings || {}),

        stageLimits: {
          ...base.settings.stageLimits,
          ...(
            (
              parsed.settings &&
              parsed.settings.stageLimits
            ) || {}
          )
        }
      }
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();

let currentPage = 'dashboard';

let simTimer = null;

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}

/* =========================================================
   HISTÓRICO
========================================================= */

function registerHistory(event) {
  state.history.unshift({
    id: uid(),

    time: new Date().toLocaleString(
      'pt-BR'
    ),

    event
  });

  state.history =
    state.history.slice(0, 250);

  saveState();
}

/* =========================================================
   TOAST / NOTIFICAÇÕES
========================================================= */

function toast(
  title,
  message = '',
  type = 'success'
) {
  const root = $('#toastRoot');

  const item =
    document.createElement('div');

  item.className = `toast ${type}`;

  item.innerHTML = `
    <div>
      <strong>${title}</strong>
      <span>${message}</span>
    </div>
  `;

  root.appendChild(item);

  setTimeout(
    () => item.remove(),
    3200
  );
}

/* =========================================================
   TEMPOS E ALERTAS
========================================================= */

function elapsedMinutes(timestamp) {
  if (!timestamp) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) /
        60000
    )
  );
}

function stageLimitFor(truck) {
  if (
    truck.status === 'OPERACAO'
  ) {
    return truck.operation === 'Carga'
      ? state.settings.stageLimits.CARGA
      : state.settings.stageLimits
          .DESCARGA;
  }

  return (
    state.settings.stageLimits[
      truck.status
    ] || null
  );
}

function levelForTruck(truck) {
  const limit =
    stageLimitFor(truck);

  if (
    !limit ||
    !truck.stageStart
  ) {
    return 'normal';
  }

  const elapsed =
    elapsedMinutes(
      truck.stageStart
    );

  if (
    elapsed >
    limit +
      Math.max(
        8,
        limit * 0.4
      )
  ) {
    return 'critico';
  }

  if (elapsed > limit) {
    return 'atraso';
  }

  if (
    elapsed >=
    limit * 0.8
  ) {
    return 'atencao';
  }

  return 'normal';
}

function badgeFor(level) {
  if (
    level === 'critico'
  ) {
    return `
      <span class="badge badge-red">
        ● Crítico
      </span>
    `;
  }

  if (
    level === 'atraso'
  ) {
    return `
      <span class="badge badge-orange">
        ● Atraso
      </span>
    `;
  }

  if (
    level === 'atencao'
  ) {
    return `
      <span class="badge badge-yellow">
        ● Atenção
      </span>
    `;
  }

  return `
    <span class="badge badge-green">
      ● Normal
    </span>
  `;
}

/* =========================================================
   GERAÇÃO DOS ALERTAS
========================================================= */

function updateAlerts() {
  const alerts = [];

  state.trucks.forEach(
    (truck) => {
      const level =
        levelForTruck(truck);

      if (
        level === 'normal'
      ) {
        return;
      }

      const elapsed =
        elapsedMinutes(
          truck.stageStart
        );

      const limit =
        stageLimitFor(truck) || 0;

      let message =
        `A etapa ${truck.status} ` +
        `está próxima do limite ` +
        `de ${limit} minutos.`;

      let responsible =
        'Gestão Logística';

      if (
        truck.status === 'PATIO'
      ) {
        message =
          `Veículo aguardando ` +
          `no pátio há ${elapsed} minutos.`;

        responsible =
          'Expedição / Recebimento';
      }

      else if (
        truck.status === 'PESAGEM'
      ) {
        message =
          `Veículo em pesagem/espera ` +
          `há ${elapsed} minutos.`;

        responsible =
          'Balança';
      }

      else if (
        truck.status === 'OPERACAO'
      ) {
        message =
          elapsed > limit
            ? `${truck.operation} excedeu ` +
              `o previsto em ` +
              `${elapsed - limit} minutos.`
            : `${truck.operation} está ` +
              `próxima do limite previsto.`;

        responsible =
          'Expedição / Recebimento';
      }

      else if (
        truck.status === 'PORTARIA'
      ) {
        responsible =
          'Portaria';
      }

      const affected =
        level === 'critico'
          ? state.trucks.filter(
              (t) =>
                t.status === 'PATIO'
            ).length
          : 0;

      alerts.push({
        id:
          `${truck.id}-` +
          `${truck.status}`,

        truckId:
          truck.id,

        level,

        stage:
          truck.status,

        message,

        responsible,

        affected,

        impact:
          affected
            ? Math.max(
                8,
                affected * 7
              )
            : 0
      });
    }
  );

  state.alerts =
    alerts;

  saveState();
}

/* =========================================================
   MÉTRICAS OPERACIONAIS
========================================================= */

function metrics() {
  updateAlerts();

  return {
    scheduled:
      state.trucks.length,

    present:
      state.trucks.filter(
        (t) =>
          ![
            'AGENDADO',
            'FINALIZADO'
          ].includes(
            t.status
          )
      ).length,

    waiting:
      state.trucks.filter(
        (t) =>
          [
            'PATIO',
            'PORTARIA'
          ].includes(
            t.status
          )
      ).length,

    operating:
      state.trucks.filter(
        (t) =>
          [
            'DOCA',
            'OPERACAO'
          ].includes(
            t.status
          )
      ).length,

    late:
      state.alerts.filter(
        (a) =>
          [
            'atraso',
            'critico'
          ].includes(
            a.level
          )
      ).length,

    released:
      state.trucks.filter(
        (t) =>
          [
            'LIBERADO',
            'FINALIZADO'
          ].includes(
            t.status
          )
      ).length,

    docks:
      state.docks.filter(
        (d) =>
          d.truckId
      ).length
  };
}

/* =========================================================
   NAVEGAÇÃO
========================================================= */

const PAGE_META = {
  dashboard: [
    'Dashboard',
    'Visão geral da operação logística'
  ],

  agendamentos: [
    'Agendamentos',
    'Planejamento inteligente das chegadas'
  ],

  operacao: [
    'Operação',
    'Fluxo dos caminhões dentro da unidade'
  ],

  docas: [
    'Docas',
    'Capacidade e utilização das docas'
  ],

  alertas: [
    'Alertas',
    'Monitoramento preventivo de atrasos'
  ],

  simulacao: [
    'Simulação',
    'Laboratório de operações'
  ],

  cenarios: [
    'Cenários',
    'Testes “E se?” e comparação'
  ],

  gemeo: [
    'Gêmeo Digital 3D',
    'Representação virtual da planta'
  ],

  indicadores: [
    'Indicadores',
    'KPIs e gargalos operacionais'
  ],

  historico: [
    'Histórico',
    'Rastreamento de eventos e decisões'
  ],

  configuracoes: [
    'Configurações',
    'Parâmetros da operação'
  ]
};

function navTo(page) {
  currentPage = page;

  $$('#nav button[data-page]').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  const pageTitle = $('#pageTitle');
  const pageSubtitle = $('#pageSubtitle');

  if (pageTitle) {
    pageTitle.textContent = PAGE_META[page][0];
  }

  if (pageSubtitle) {
    pageSubtitle.textContent = PAGE_META[page][1];
  }

  const sidebar = $('#sidebar');

  if (sidebar) {
    sidebar.classList.remove('open');
  }

  render();
}

/* =========================================================
   COMPONENTES DE INTERFACE
========================================================= */

function pageHead(
  title,
  description,
  actions = ''
) {
  return `
    <div class="page-head">

      <div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>

      <div class="actions">
        ${actions}
      </div>

    </div>
  `;
}

function kpi(
  icon,
  label,
  value,
  tone = ''
) {
  return `
    <div class="kpi ${tone}">

      <div class="kpi-icon">
        ${icon}
      </div>

      <div>
        <strong>
          ${value}
        </strong>

        <span>
          ${label}
        </span>
      </div>

    </div>
  `;
}

/* =========================================================
   TABELA DOS CAMINHÕES
========================================================= */

function truckTable(
  list = state.trucks
) {
  if (!list.length) {
    return `
      <div class="empty-state">

        <h3>
          Nenhum caminhão encontrado
        </h3>

        <p>
          Cadastre um novo agendamento
          para começar.
        </p>

      </div>
    `;
  }

  return `
    <div class="table-wrap">

      <table class="data-table">

        <thead>

          <tr>

            <th>Placa</th>

            <th>
              Transportadora
            </th>

            <th>
              Operação
            </th>

            <th>
              Carga
            </th>

            <th>
              Etapa
            </th>

            <th>
              Doca
            </th>

            <th>
              Horário
            </th>

            <th>
              Status
            </th>

          </tr>

        </thead>

        <tbody>

          ${list
            .map(
              (truck) => `
                <tr>

                  <td>
                    <span class="plate">
                      ${truck.placa}
                    </span>
                  </td>

                  <td>
                    ${truck.transportadora}
                  </td>

                  <td>
                    ${truck.operation}
                  </td>

                  <td>
                    ${truck.cargo}
                  </td>

                  <td>
                    ${truck.status}
                  </td>

                  <td>
                    ${
                      truck.dock
                        ? `Doca ${String(
                            truck.dock
                          ).padStart(
                            2,
                            '0'
                          )}`
                        : '—'
                    }
                  </td>

                  <td>
                    ${
                      truck.entry ||
                      truck.time
                    }
                  </td>

                  <td>
                    ${badgeFor(
                      levelForTruck(
                        truck
                      )
                    )}
                  </td>

                </tr>
              `
            )
            .join('')}

        </tbody>

      </table>

    </div>
  `;
}

/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {
  const m =
    metrics();

  const priority =
    state.alerts.find(
      (a) =>
        a.level ===
        'critico'
    ) ||
    state.alerts.find(
      (a) =>
        a.level ===
        'atraso'
    );

  return `
    ${pageHead(
      'Central Operacional',

      'Acompanhe a situação atual dos veículos, docas e gargalos.',

      `
        <button
          class="btn btn-primary"
          id="newSchedule"
        >
          ＋ Novo agendamento
        </button>
      `
    )}

    <div class="kpi-grid">

      ${kpi(
        '📅',
        'Previstos',
        m.scheduled
      )}

      ${kpi(
        '🚛',
        'Na fábrica',
        m.present,
        'green'
      )}

      ${kpi(
        '🅿️',
        'Aguardando',
        m.waiting,
        'yellow'
      )}

      ${kpi(
        '📦',
        'Em operação',
        m.operating
      )}

      ${kpi(
        '🚨',
        'Atrasados',
        m.late,
        m.late
          ? 'red'
          : 'green'
      )}

      ${kpi(
        '🏭',
        'Docas ocupadas',
        `${m.docks}/` +
          `${state.settings.dockCount}`,
        'orange'
      )}

    </div>

    <div class="grid-2">

      <div class="panel">

        <div class="panel-head">

          <div>

            <h3>
              Operação em tempo real
            </h3>

            <p>
              Status atual dos veículos
              cadastrados.
            </p>

          </div>

          <span class="badge badge-green">
            ● AO VIVO
          </span>

        </div>

        ${truckTable()}

      </div>

      <div>

        <div class="panel">

          <div class="panel-head">

            <div>

              <h3>
                Alertas prioritários
              </h3>

              <p>
                Ocorrências que exigem
                atenção.
              </p>

            </div>

          </div>

          <div class="panel-body">

            ${
              state.alerts.length
                ? state.alerts
                    .slice(
                      0,
                      5
                    )
                    .map(
                      alertCard
                    )
                    .join('')
                : `
                  <div
                    class="empty-state"
                    style="min-height:210px"
                  >

                    <h3>
                      Operação estável
                    </h3>

                    <p>
                      Nenhum alerta
                      no momento.
                    </p>

                  </div>
                `
            }

          </div>

        </div>

        <div class="panel mt-15">

          <div class="panel-head">
            <h3>
              Próxima ação recomendada
            </h3>
          </div>

          <div class="panel-body">

            ${
              priority
                ? recommendationForAlert(
                    priority
                  )
                : `
                  <strong>
                    Sem intervenção necessária
                  </strong>

                  <p class="muted small">
                    Use o simulador para
                    testar o próximo turno
                    ou um aumento de demanda.
                  </p>
                `
            }

          </div>

        </div>

      </div>

    </div>
  `;
}

function recommendationForAlert(
  alert
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        alert.truckId
    );

  const freeDock =
    state.docks.find(
      (d) =>
        !d.truckId
    );

  if (
    truck &&
    truck.status === 'PATIO' &&
    freeDock
  ) {
    return `
      <strong>
        Direcionar
        ${truck.placa}
        para a Doca
        ${String(
          freeDock.id
        ).padStart(
          2,
          '0'
        )}
      </strong>

      <p class="muted small">
        Existe uma doca livre.
        A movimentação pode reduzir
        a fila no pátio.
      </p>
    `;
  }

  return `
    <strong>
      Atuar no caminhão
      ${truck?.placa || ''}
    </strong>

    <p class="muted small">
      ${alert.message}
    </p>
  `;
}

/* =========================================================
   AGENDAMENTOS
========================================================= */

function renderScheduling() {
  const sorted =
    [...state.trucks].sort(
      (a, b) =>
        `${a.date} ${a.time}`.localeCompare(
          `${b.date} ${b.time}`
        )
    );

  return `
    ${pageHead(
      'Agendamentos',

      'Distribua as chegadas conforme a capacidade operacional.',

      `
        <button
          class="btn btn-primary"
          id="newSchedule"
        >
          ＋ Agendar caminhão
        </button>
      `
    )}

    <div class="panel">

      <div class="panel-head">

        <div>

          <h3>
            Agenda de veículos
          </h3>

          <p>
            Dados demonstrativos
            salvos no navegador.
          </p>

        </div>

      </div>

      ${truckTable(
        sorted
      )}

    </div>
  `;
}

/* =========================================================
   MODAL DE AGENDAMENTO
========================================================= */

function openScheduleModal() {
  $('#modalRoot').innerHTML = `
    <div class="modal-backdrop">

      <form
        class="modal"
        id="scheduleForm"
      >

        <div class="modal-head">

          <div>

            <h2>
              Novo agendamento
            </h2>

            <p>
              Cadastre a chegada antes
              do caminhão entrar
              na indústria.
            </p>

          </div>

          <button
            class="modal-close"
            type="button"
            data-close-modal
          >
            ✕
          </button>

        </div>

        <div class="modal-body">

          <div class="form-grid cols-3">

            <div class="form-field">

              <label>
                Placa
              </label>

              <input
                class="input"
                name="placa"
                required
                placeholder="ABC1D23"
              >

            </div>

            <div class="form-field">

              <label>
                Motorista
              </label>

              <input
                class="input"
                name="motorista"
                required
              >

            </div>

            <div class="form-field">

              <label>
                Transportadora
              </label>

              <input
                class="input"
                name="transportadora"
                required
              >

            </div>

            <div class="form-field">

              <label>
                Veículo
              </label>

              <select
                class="input"
                name="vehicle"
              >

                ${VEHICLES
                  .map(
                    (v) =>
                      `<option>${v}</option>`
                  )
                  .join('')}

              </select>

            </div>

            <div class="form-field">

              <label>
                Operação
              </label>

              <select
                class="input"
                name="operation"
              >

                <option>
                  Carga
                </option>

                <option>
                  Descarga
                </option>

              </select>

            </div>

            <div class="form-field">

              <label>
                Carga
              </label>

              <input
                class="input"
                name="cargo"
                required
                placeholder="Matéria-prima"
              >

            </div>

            <div class="form-field">

              <label>
                Peso estimado (kg)
              </label>

              <input
                class="input"
                name="weight"
                type="number"
                value="20000"
              >

            </div>

            <div class="form-field">

              <label>
                Quantidade
              </label>

              <input
                class="input"
                name="qty"
                type="number"
                value="20"
              >

            </div>

            <div class="form-field">

              <label>
                Data
              </label>

              <input
                class="input"
                name="date"
                type="date"
                required
                value="2026-08-13"
              >

            </div>

            <div class="form-field">

              <label>
                Horário
              </label>

              <input
                class="input"
                name="time"
                type="time"
                required
                value="08:00"
              >

            </div>

          </div>

          <div
            id="scheduleWarning"
            class="mt-15"
          ></div>

        </div>

        <div class="modal-foot">

          <button
            class="btn btn-secondary"
            type="button"
            data-close-modal
          >
            Cancelar
          </button>

          <button
            class="btn btn-primary"
            type="submit"
          >
            Confirmar agendamento
          </button>

        </div>

      </form>

    </div>
  `;

  $$(
    '[data-close-modal]'
  ).forEach(
    (button) =>
      button.onclick =
        closeModal
  );

  const form =
    $('#scheduleForm');

  const timeInput =
    form.elements.time;

  const dateInput =
    form.elements.date;

  const checkCapacity =
    () => {
      const count =
        state.trucks.filter(
          (t) =>
            t.date ===
              dateInput.value &&
            t.time ===
              timeInput.value
        ).length;

      const root =
        $('#scheduleWarning');

      if (
        count >= 3
      ) {
        const suggested =
          minutesToClock(
            timeToMinutes(
              timeInput.value
            ) + 30
          );

        root.innerHTML = `
          <div class="alert-card attention">

            <div class="alert-icon">
              ⚠️
            </div>

            <div class="alert-content">

              <strong>
                Alta ocupação prevista
              </strong>

              <p>
                Já existem
                ${count}
                veículos nesse horário.

                Sugestão:
                ${suggested}.
              </p>

            </div>

          </div>
        `;
      } else {
        root.innerHTML = `
          <span class="badge badge-green">
            ✓ Capacidade disponível
          </span>
        `;
      }
    };

  timeInput.addEventListener(
    'change',
    checkCapacity
  );

  dateInput.addEventListener(
    'change',
    checkCapacity
  );

  checkCapacity();

  form.onsubmit =
    (event) => {
      event.preventDefault();

      const data =
        new FormData(
          form
        );

      const truck = {
        id:
          uid(),

        placa:
          String(
            data.get(
              'placa'
            )
          )
            .toUpperCase()
            .replace(
              /[^A-Z0-9]/g,
              ''
            ),

        motorista:
          String(
            data.get(
              'motorista'
            )
          ),

        transportadora:
          String(
            data.get(
              'transportadora'
            )
          ),

        vehicle:
          String(
            data.get(
              'vehicle'
            )
          ),

        cargo:
          String(
            data.get(
              'cargo'
            )
          ),

        weight:
          Number(
            data.get(
              'weight'
            )
          ) || 0,

        qty:
          Number(
            data.get(
              'qty'
            )
          ) || 0,

        operation:
          String(
            data.get(
              'operation'
            )
          ),

        date:
          String(
            data.get(
              'date'
            )
          ),

        time:
          String(
            data.get(
              'time'
            )
          ),

        status:
          'AGENDADO'
      };

      state.trucks.push(
        truck
      );

      registerHistory(
        `Agendamento criado para ` +
        `${truck.placa} às ` +
        `${truck.time}.`
      );

      saveState();

      closeModal();

      toast(
        'Agendamento confirmado',

        `${truck.placa} cadastrado ` +
        `para ${truck.time}.`
      );

      render();
    };
}

function closeModal() {
  $('#modalRoot')
    .innerHTML = '';
}/* =========================================================
   OPERAÇÃO
========================================================= */

function renderOperation() {
  const active = state.trucks.filter(
    (t) => t.status !== 'AGENDADO'
  );

  if (!active.length) {
    return `
      ${pageHead(
        'Operação',
        'Acompanhe cada caminhão desde a entrada até a saída.'
      )}

      <div class="empty-state">

        <h3>
          Nenhuma operação ativa
        </h3>

        <p>
          Libere um caminhão pela portaria
          para iniciar o fluxo.
        </p>

      </div>
    `;
  }

  return `
    ${pageHead(
      'Operação',
      'Acompanhe o caminhão em cada etapa do processo.'
    )}

    <div class="operation-list">

      ${active
        .map(
          (truck) => `
            <div class="operation-card">

              <div class="operation-top">

                <div>

                  <span class="plate">
                    ${truck.placa}
                  </span>

                  <h3>
                    ${truck.status}
                  </h3>

                </div>

                <div>
                  ${badgeFor(
                    levelForTruck(
                      truck
                    )
                  )}
                </div>

              </div>

              <div class="operation-meta">

                <span>
                  🚛 ${truck.vehicle}
                </span>

                <span>
                  🏢 ${truck.transportadora}
                </span>

                <span>
                  📦 ${truck.cargo}
                </span>

                <span>
                  🔄 ${truck.operation}
                </span>

                <span>
                  ⏱️ ${elapsedMinutes(
                    truck.stageStart
                  )} min
                </span>

                ${
                  truck.dock
                    ? `
                      <span>
                        🏭 Doca
                        ${String(
                          truck.dock
                        ).padStart(
                          2,
                          '0'
                        )}
                      </span>
                    `
                    : ''
                }

              </div>

              ${renderTruckTimeline(
                truck
              )}

              <div class="operation-actions">

                ${operationButtons(
                  truck
                )}

              </div>

            </div>
          `
        )
        .join('')}

    </div>
  `;
}

function renderTruckTimeline(
  truck
) {
  const currentIndex =
    STAGES.indexOf(
      truck.status
    );

  return `
    <div class="timeline">

      ${STAGES.map(
        (stage, index) => {
          let cls = '';

          if (
            index <
            currentIndex
          ) {
            cls = 'done';
          }

          if (
            index ===
            currentIndex
          ) {
            cls = 'current';
          }

          return `
            <div
              class="timeline-step ${cls}"
            >
              ${stage}
            </div>
          `;
        }
      ).join('')}

    </div>
  `;
}

function operationButtons(
  truck
) {
  if (
    truck.status === 'PORTARIA'
  ) {
    return `
      <button
        class="btn btn-primary"
        data-next-stage="${truck.id}"
      >
        Concluir portaria
      </button>
    `;
  }

  if (
    truck.status === 'PESAGEM'
  ) {
    return `
      <button
        class="btn btn-primary"
        data-next-stage="${truck.id}"
      >
        Concluir pesagem
      </button>
    `;
  }

  if (
    truck.status === 'PATIO'
  ) {
    return `
      <button
        class="btn btn-primary"
        data-send-dock="${truck.id}"
      >
        Direcionar para doca
      </button>
    `;
  }

  if (
    truck.status === 'DOCA'
  ) {
    return `
      <button
        class="btn btn-primary"
        data-start-operation="${truck.id}"
      >
        Iniciar ${truck.operation}
      </button>

      <button
        class="btn btn-secondary"
        data-change-dock="${truck.id}"
      >
        Trocar doca
      </button>
    `;
  }

  if (
    truck.status === 'OPERACAO'
  ) {
    return `
      <button
        class="btn btn-success"
        data-finish-operation="${truck.id}"
      >
        Finalizar ${truck.operation}
      </button>
    `;
  }

  if (
    truck.status === 'CONFERENCIA'
  ) {
    return `
      <button
        class="btn btn-primary"
        data-next-stage="${truck.id}"
      >
        Finalizar conferência
      </button>
    `;
  }

  if (
    truck.status === 'LIBERADO'
  ) {
    return `
      <button
        class="btn btn-success"
        data-next-stage="${truck.id}"
      >
        Registrar saída
      </button>
    `;
  }

  return '';
}

/* =========================================================
   MOVIMENTAÇÃO DOS CAMINHÕES
========================================================= */

function moveToNextStage(
  truckId
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        Number(truckId)
    );

  if (!truck) {
    return;
  }

  const index =
    STAGES.indexOf(
      truck.status
    );

  if (
    index < 0 ||
    index >=
      STAGES.length - 1
  ) {
    return;
  }

  const next =
    STAGES[index + 1];

  truck.status =
    next;

  truck.stageStart =
    Date.now();

  if (
    next === 'FINALIZADO'
  ) {
    truck.exit =
      nowClock();

    registerHistory(
      `${truck.placa} saiu da unidade às ${truck.exit}.`
    );
  } else {
    registerHistory(
      `${truck.placa} avançou para ${next}.`
    );
  }

  saveState();

  toast(
    'Etapa concluída',
    `${truck.placa} → ${next}`
  );

  render();
}

/* =========================================================
   DOCAS
========================================================= */

function availableDocks() {
  return state.docks.filter(
    (d) =>
      !d.truckId
  );
}

function bestDockFor(
  truck
) {
  const free =
    availableDocks();

  if (!free.length) {
    return null;
  }

  /*
    Regra simplificada:
    - cargas maiores usam docas de maior número;
    - cargas menores priorizam docas iniciais;
    - sempre usa apenas docas livres.
  */

  const sorted =
    [...free].sort(
      (a, b) => {
        if (
          truck.vehicle ===
            'Bitrem' ||
          truck.vehicle ===
            'Rodotrem'
        ) {
          return b.id - a.id;
        }

        return a.id - b.id;
      }
    );

  return sorted[0];
}

function sendTruckToDock(
  truckId
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        Number(truckId)
    );

  if (!truck) {
    return;
  }

  const dock =
    bestDockFor(
      truck
    );

  if (!dock) {
    toast(
      'Nenhuma doca disponível',
      'O caminhão permanecerá aguardando no pátio.',
      'warning'
    );

    return;
  }

  dock.truckId =
    truck.id;

  truck.dock =
    dock.id;

  truck.status =
    'DOCA';

  truck.stageStart =
    Date.now();

  registerHistory(
    `${truck.placa} direcionado para Doca ${dock.id}.`
  );

  saveState();

  toast(
    'Doca definida',
    `${truck.placa} → Doca ${String(
      dock.id
    ).padStart(
      2,
      '0'
    )}`
  );

  render();
}

function startTruckOperation(
  truckId
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        Number(truckId)
    );

  if (!truck) {
    return;
  }

  truck.status =
    'OPERACAO';

  truck.stageStart =
    Date.now();

  registerHistory(
    `${truck.operation} iniciada para ${truck.placa}.`
  );

  saveState();

  toast(
    `${truck.operation} iniciada`,
    `${truck.placa} está em operação.`
  );

  render();
}

function finishTruckOperation(
  truckId
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        Number(truckId)
    );

  if (!truck) {
    return;
  }

  const dock =
    state.docks.find(
      (d) =>
        d.truckId ===
        truck.id
    );

  if (dock) {
    dock.truckId =
      null;
  }

  truck.dock =
    null;

  truck.status =
    'CONFERENCIA';

  truck.stageStart =
    Date.now();

  registerHistory(
    `${truck.operation} finalizada para ${truck.placa}.`
  );

  saveState();

  toast(
    'Operação finalizada',
    `${truck.placa} liberou a doca.`
  );

  render();
}

function changeDock(
  truckId
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        Number(truckId)
    );

  if (!truck) {
    return;
  }

  const current =
    state.docks.find(
      (d) =>
        d.truckId ===
        truck.id
    );

  const alternatives =
    state.docks.filter(
      (d) =>
        !d.truckId &&
        d.id !== truck.dock
    );

  if (
    !alternatives.length
  ) {
    toast(
      'Sem alternativa',
      'Não existe outra doca livre.',
      'warning'
    );

    return;
  }

  const next =
    alternatives[0];

  if (current) {
    current.truckId =
      null;
  }

  next.truckId =
    truck.id;

  truck.dock =
    next.id;

  truck.stageStart =
    Date.now();

  registerHistory(
    `${truck.placa} transferido para Doca ${next.id}.`
  );

  saveState();

  toast(
    'Doca alterada',
    `${truck.placa} → Doca ${next.id}`
  );

  render();
}

/* =========================================================
   RENDERIZAÇÃO DAS DOCAS
========================================================= */

function renderDocks() {
  return `
    ${pageHead(
      'Gestão de Docas',

      'Controle visual da capacidade de carga e descarga.',

      `
        <button
          class="btn btn-secondary"
          id="addVirtualDock"
        >
          ＋ Adicionar doca
        </button>
      `
    )}

    <div class="kpi-grid">

      ${kpi(
        '🏭',
        'Total de docas',
        state.docks.length
      )}

      ${kpi(
        '🟢',
        'Livres',
        availableDocks()
          .length,
        'green'
      )}

      ${kpi(
        '🚛',
        'Ocupadas',
        state.docks.filter(
          (d) =>
            d.truckId
        ).length,
        'orange'
      )}

      ${kpi(
        '📊',
        'Utilização',
        `${Math.round(
          (
            state.docks.filter(
              (d) =>
                d.truckId
            ).length /
            Math.max(
              1,
              state.docks.length
            )
          ) *
            100
        )}%`
      )}

    </div>

    <div class="dock-grid">

      ${state.docks
        .map(
          (dock) => {
            const truck =
              state.trucks.find(
                (t) =>
                  t.id ===
                  dock.truckId
              );

            if (!truck) {
              return `
                <div class="dock-card free">

                  <div class="dock-name">
                    Doca
                    ${String(
                      dock.id
                    ).padStart(
                      2,
                      '0'
                    )}
                  </div>

                  <div class="dock-content">

                    <span class="badge badge-green">
                      ● Livre
                    </span>

                    <p>
                      Disponível para
                      nova operação.
                    </p>

                  </div>

                </div>
              `;
            }

            const level =
              levelForTruck(
                truck
              );

            const cssClass =
              level === 'critico'
                ? 'critical'
                : level ===
                  'atraso'
                ? 'busy'
                : level ===
                  'atencao'
                ? 'attention'
                : 'busy';

            return `
              <div
                class="dock-card ${cssClass}"
              >

                <div class="dock-name">
                  Doca
                  ${String(
                    dock.id
                  ).padStart(
                    2,
                    '0'
                  )}
                </div>

                <div class="dock-content">

                  ${badgeFor(
                    level
                  )}

                  <h3>
                    ${truck.placa}
                  </h3>

                  <p>
                    ${truck.operation}
                  </p>

                  <p>
                    ${truck.cargo}
                  </p>

                  <div class="timer">
                    ⏱️
                    ${elapsedMinutes(
                      truck.stageStart
                    )}
                    min
                  </div>

                </div>

              </div>
            `;
          }
        )
        .join('')}

    </div>
  `;
}

/* =========================================================
   ALERTAS
========================================================= */

function alertCard(
  alert
) {
  const truck =
    state.trucks.find(
      (t) =>
        t.id ===
        alert.truckId
    );

  const css =
    alert.level ===
      'critico'
      ? 'critical'
      : alert.level ===
        'atraso'
      ? 'delay'
      : 'attention';

  return `
    <div class="alert-card ${css}">

      <div class="alert-icon">
        ${
          alert.level ===
          'critico'
            ? '🔴'
            : alert.level ===
              'atraso'
            ? '🟠'
            : '🟡'
        }
      </div>

      <div class="alert-content">

        <strong>
          ${
            alert.level ===
            'critico'
              ? 'Gargalo crítico'
              : alert.level ===
                'atraso'
              ? 'Atraso operacional'
              : 'Atenção operacional'
          }
        </strong>

        <p>
          ${alert.message}
        </p>

        <small>
          ${truck?.placa || '—'}
          •
          ${alert.responsible}
        </small>

      </div>

      ${
        alert.affected
          ? `
            <div class="alert-impact">

              <strong>
                ${alert.affected}
                caminhões afetados
              </strong>

              <div class="mt-10">
                Impacto estimado:
                +${alert.impact} min
              </div>

            </div>
          `
          : ''
      }

    </div>
  `;
}

function renderAlerts() {
  updateAlerts();

  return `
    ${pageHead(
      'Central de Alertas',

      'Identificação preventiva de atrasos e gargalos.'
    )}

    <div class="kpi-grid">

      ${kpi(
        '🟡',
        'Atenção',
        state.alerts.filter(
          (a) =>
            a.level ===
            'atencao'
        ).length,
        'yellow'
      )}

      ${kpi(
        '🟠',
        'Atrasos',
        state.alerts.filter(
          (a) =>
            a.level ===
            'atraso'
        ).length,
        'orange'
      )}

      ${kpi(
        '🔴',
        'Críticos',
        state.alerts.filter(
          (a) =>
            a.level ===
            'critico'
        ).length,
        'red'
      )}

      ${kpi(
        '🚛',
        'Veículos monitorados',
        state.trucks.filter(
          (t) =>
            ![
              'AGENDADO',
              'FINALIZADO'
            ].includes(
              t.status
            )
        ).length
      )}

    </div>

    ${
      state.alerts.length
        ? `
          <div class="alert-list">

            ${state.alerts
              .map(
                alertCard
              )
              .join('')}

          </div>
        `
        : `
          <div class="empty-state">

            <h3>
              Nenhum alerta operacional
            </h3>

            <p>
              Todos os processos estão
              dentro dos limites definidos.
            </p>

          </div>
        `
    }
  `;
}

/* =========================================================
   MOTOR DE SIMULAÇÃO
========================================================= */

function seededRandom(seed) {
  let value =
    seed % 2147483647;

  if (
    value <= 0
  ) {
    value +=
      2147483646;
  }

  return () => {
    value =
      (value * 16807) %
      2147483647;

    return (
      value - 1
    ) /
      2147483646;
  };
}

/* =========================================================
   GERAÇÃO DE CAMINHÕES SIMULADOS
========================================================= */

function generateSimulationTrucks(
  config
) {
  const random =
    seededRandom(
      config.seed || 12345
    );

  const trucks = [];

  const totalMinutes =
    config.end -
    config.start;

  for (
    let i = 0;
    i <
    config.truckCount;
    i++
  ) {
    let arrival =
      config.start +
      Math.floor(
        random() *
          totalMinutes
      );

    /*
      Horário de pico:
      aumenta concentração
      entre 07:00 e 10:00.
    */

    if (
      random() <
      config.peakShare
    ) {
      arrival =
        420 +
        Math.floor(
          random() *
            180
        );
    }

    const vehicleRoll =
      random();

    let vehicle =
      'Truck';

    if (
      vehicleRoll <
      0.15
    ) {
      vehicle =
        'VUC';
    } else if (
      vehicleRoll <
      0.3
    ) {
      vehicle =
        'Toco';
    } else if (
      vehicleRoll <
      0.55
    ) {
      vehicle =
        'Truck';
    } else if (
      vehicleRoll <
      0.82
    ) {
      vehicle =
        'Carreta';
    } else if (
      vehicleRoll <
      0.94
    ) {
      vehicle =
        'Bitrem';
    } else {
      vehicle =
        'Rodotrem';
    }

    const operation =
      random() < 0.5
        ? 'Carga'
        : 'Descarga';

    trucks.push({
      id:
        `SIM-${i + 1}`,

      plate:
        `SIM${String(
          i + 1
        ).padStart(
          4,
          '0'
        )}`,

      vehicle,

      operation,

      arrival,

      stage:
        'AGUARDANDO_CHEGADA',

      stageStart:
        arrival,

      queueStart:
        null,

      dock:
        null,

      totalWait:
        0,

      productive:
        0,

      finished:
        false,

      history: []
    });
  }

  return trucks.sort(
    (a, b) =>
      a.arrival -
      b.arrival
  );
}

/* =========================================================
   CRIAÇÃO DA SIMULAÇÃO
========================================================= */

function createSimulation(
  options = {}
) {
  const config = {
    start:
      options.start ||
      360,

    end:
      options.end ||
      1080,

    truckCount:
      options.truckCount ||
      100,

    dockCount:
      options.dockCount ||
      state.settings.dockCount,

    scaleCount:
      options.scaleCount ||
      state.settings.scaleCount,

    yardCapacity:
      options.yardCapacity ||
      state.settings.yardCapacity,

    forklifts:
      options.forklifts ||
      state.settings.forklifts,

    peakShare:
      options.peakShare ??
      0.45,

    seed:
      options.seed ||
      20260813
  };

  const sim = {
    config,

    time:
      config.start,

    running:
      false,

    speed:
      5,

    trucks:
      generateSimulationTrucks(
        config
      ),

    gates: Array.from(
      {
        length:
          state.settings
            .gateCount
      },
      () => null
    ),

    scales: Array.from(
      {
        length:
          config.scaleCount
      },
      () => null
    ),

    docks: Array.from(
      {
        length:
          config.dockCount
      },
      () => null
    ),

    forkliftBusy:
      0,

    yard: [],

    events: [],

    interventions: [],

    stats: {
      finished: 0,
      maxQueue: 0,
      maxYard: 0,
      totalWait: 0,
      totalCycle: 0,
      dockBusyMinutes: 0
    },

    breakdowns: {
      closedDocks: [],
      scaleClosedUntil:
        null,
      forkliftPenaltyUntil:
        null
    }
  };

  simEvent(
    sim,
    'Simulação iniciada.'
  );

  return sim;
}

function simEvent(
  sim,
  message
) {
  sim.events.unshift({
    time:
      sim.time,

    message
  });

  sim.events =
    sim.events.slice(
      0,
      200
    );
}

/* =========================================================
   PROCESSAMENTO DE UMA ETAPA DA SIMULAÇÃO
========================================================= */

function runSimulationMinute(
  sim
) {
  const time =
    sim.time;

  /* ---------------------------
     CHEGADAS
  ---------------------------- */

  sim.trucks.forEach(
    (truck) => {
      if (
        truck.stage ===
          'AGUARDANDO_CHEGADA' &&
        truck.arrival <=
          time
      ) {
        truck.stage =
          'FILA_PORTARIA';

        truck.stageStart =
          time;

        truck.queueStart =
          time;

        simEvent(
          sim,
          `${truck.plate} chegou à portaria.`
        );
      }
    }
  );

  /* ---------------------------
     PORTARIA
  ---------------------------- */

  const gateQueue =
    sim.trucks.filter(
      (t) =>
        t.stage ===
        'FILA_PORTARIA'
    );

  sim.stats.maxQueue =
    Math.max(
      sim.stats.maxQueue,
      gateQueue.length
    );

  sim.gates.forEach(
    (gate, index) => {
      if (!gate) {
        const truck =
          gateQueue[0];

        if (truck) {
          sim.gates[index] =
            {
              truckId:
                truck.id,

              end:
                time +
                4
            };

          truck.stage =
            'PORTARIA';

          truck.totalWait +=
            time -
            truck.queueStart;

          truck.stageStart =
            time;

          truck.productive +=
            4;
        }
      }

      const active =
        sim.gates[index];

      if (
        active &&
        active.end <=
          time
      ) {
        const truck =
          sim.trucks.find(
            (t) =>
              t.id ===
              active.truckId
          );

        truck.stage =
          'FILA_BALANCA';

        truck.queueStart =
          time;

        truck.stageStart =
          time;

        sim.gates[index] =
          null;

        simEvent(
          sim,
          `${truck.plate} concluiu portaria.`
        );
      }
    }
  );

  /* ---------------------------
     BALANÇAS
  ---------------------------- */

  const scalesAvailable =
    !(
      sim.breakdowns
        .scaleClosedUntil &&
      time <
        sim.breakdowns
          .scaleClosedUntil
    );

  if (
    scalesAvailable
  ) {
    const scaleQueue =
      sim.trucks.filter(
        (t) =>
          t.stage ===
          'FILA_BALANCA'
      );

    sim.scales.forEach(
      (scale, index) => {
        if (!scale) {
          const truck =
            scaleQueue[0];

          if (truck) {
            sim.scales[index] =
              {
                truckId:
                  truck.id,

                end:
                  time +
                  7
              };

            truck.stage =
              'PESAGEM';

            truck.totalWait +=
              time -
              truck.queueStart;

            truck.stageStart =
              time;

            truck.productive +=
              7;
          }
        }

        const active =
          sim.scales[index];

        if (
          active &&
          active.end <=
            time
        ) {
          const truck =
            sim.trucks.find(
              (t) =>
                t.id ===
                active.truckId
            );

          truck.stage =
            'PATIO';

          truck.stageStart =
            time;

          truck.queueStart =
            time;

          sim.yard.push(
            truck.id
          );

          sim.scales[index] =
            null;

          simEvent(
            sim,
            `${truck.plate} concluiu pesagem.`
          );
        }
      }
    );
  }

  /* ---------------------------
     PÁTIO / DOCAS
  ---------------------------- */

  sim.stats.maxYard =
    Math.max(
      sim.stats.maxYard,
      sim.yard.length
    );

  const closed =
    sim.breakdowns.closedDocks;

  sim.docks.forEach(
    (dock, index) => {
      const dockNumber =
        index + 1;

      const isClosed =
        closed.some(
          (item) =>
            item.id ===
              dockNumber &&
            time <
              item.until
        );

      if (
        isClosed
      ) {
        return;
      }

      if (!dock) {
        const waitingId =
          sim.yard[0];

        if (waitingId) {
          const truck =
            sim.trucks.find(
              (t) =>
                t.id ===
                waitingId
            );

          sim.yard.shift();

          truck.totalWait +=
            time -
            truck.queueStart;

          truck.stage =
            'OPERACAO';

          truck.stageStart =
            time;

          truck.dock =
            dockNumber;

          const baseDuration =
            truck.operation ===
              'Carga'
              ? 30
              : 35;

          const vehiclePenalty =
            [
              'Bitrem',
              'Rodotrem'
            ].includes(
              truck.vehicle
            )
              ? 8
              : truck.vehicle ===
                  'Carreta'
              ? 4
              : 0;

          let forkliftPenalty =
            0;

          if (
            sim.breakdowns
              .forkliftPenaltyUntil &&
            time <
              sim.breakdowns
                .forkliftPenaltyUntil
          ) {
            forkliftPenalty =
              10;
          }

          const duration =
            baseDuration +
            vehiclePenalty +
            forkliftPenalty;

          truck.productive +=
            duration;

          sim.docks[index] =
            {
              truckId:
                truck.id,

              end:
                time +
                duration
            };

          simEvent(
            sim,
            `${truck.plate} iniciou ${truck.operation} na Doca ${dockNumber}.`
          );
        }
      }

      const active =
        sim.docks[index];

      if (active) {
        sim.stats
          .dockBusyMinutes +=
          1;
      }

      if (
        active &&
        active.end <=
          time
      ) {
        const truck =
          sim.trucks.find(
            (t) =>
              t.id ===
              active.truckId
          );

        truck.stage =
          'CONFERENCIA';

        truck.stageStart =
          time;

        truck.conferenceEnd =
          time +
          8;

        truck.dock =
          null;

        sim.docks[index] =
          null;

        simEvent(
          sim,
          `${truck.plate} concluiu ${truck.operation}.`
        );
      }
    }
  );

  /* ---------------------------
     CONFERÊNCIA E SAÍDA
  ---------------------------- */

  sim.trucks.forEach(
    (truck) => {
      if (
        truck.stage ===
          'CONFERENCIA' &&
        truck.conferenceEnd <=
          time
      ) {
        truck.productive +=
          8;

        truck.stage =
          'FINALIZADO';

        truck.finished =
          true;

        truck.exit =
          time;

        sim.stats.finished +=
          1;

        sim.stats.totalWait +=
          truck.totalWait;

        sim.stats.totalCycle +=
          truck.exit -
          truck.arrival;

        simEvent(
          sim,
          `${truck.plate} saiu da unidade.`
        );
      }
    }
  );

  /* ---------------------------
     AVANÇO DO TEMPO
  ---------------------------- */

  sim.time += 1;

  if (
    sim.time >
      sim.config.end &&
    sim.trucks.every(
      (t) =>
        t.finished ||
        t.stage ===
          'AGUARDANDO_CHEGADA'
    )
  ) {
    sim.running =
      false;

    simEvent(
      sim,
      'Simulação concluída.'
    );
  }
}

/* =========================================================
   RESUMO DA SIMULAÇÃO
========================================================= */

function simulationResults(
  sim
) {
  const finished =
    sim.trucks.filter(
      (t) =>
        t.finished
    );

  const avgWait =
    finished.length
      ? sim.stats.totalWait /
        finished.length
      : 0;

  const avgCycle =
    finished.length
      ? sim.stats.totalCycle /
        finished.length
      : 0;

  const totalAvailableDockMinutes =
    Math.max(
      1,
      sim.config.dockCount *
        Math.max(
          1,
          sim.time -
            sim.config.start
        )
    );

  const dockUse =
    clamp(
      (
        sim.stats
          .dockBusyMinutes /
        totalAvailableDockMinutes
      ) *
        100,
      0,
      100
    );

  return {
    finished:
      finished.length,

    avgWait:
      Math.round(
        avgWait
      ),

    avgCycle:
      Math.round(
        avgCycle
      ),

    maxQueue:
      sim.stats.maxQueue,

    maxYard:
      sim.stats.maxYard,

    dockUse:
      Math.round(
        dockUse
      )
  };
}

/* =========================================================
   SIMULAÇÃO RÁPIDA ATÉ O FINAL
========================================================= */

function runSimulationToEnd(
  options = {}
) {
  const sim =
    createSimulation(
      options
    );

  let safety =
    0;

  while (
    safety <
    5000
  ) {
    runSimulationMinute(
      sim
    );

    safety++;

    const allDone =
      sim.trucks.every(
        (t) =>
          t.finished
      );

    if (
      allDone
    ) {
      break;
    }

    if (
      sim.time >
      sim.config.end +
        1000
    ) {
      break;
    }
  }

  return {
    sim,
    results:
      simulationResults(
        sim
      )
  };
}/* =========================================================
   TELA DE SIMULAÇÃO
========================================================= */

function renderSimulation() {
  if (!state.sim) {
    state.sim = createSimulation();
  }

  const sim = state.sim;
  const r = simulationResults(sim);

  return `
    ${pageHead(
      'Laboratório de Operações',
      'Simule um dia inteiro, teste falhas e acompanhe o impacto em filas e docas.',
      `
        <button class="btn btn-primary" id="newSimulation">
          ▶ Nova simulação
        </button>
      `
    )}

    <div class="simulation-layout">

      <div class="sim-controls">

        <h3>Configuração</h3>

        <div class="form-field mt-15">
          <label>Caminhões no período</label>
          <input
            class="input"
            type="number"
            id="simTruckCount"
            min="1"
            max="500"
            value="${sim.config.truckCount}"
          >
        </div>

        <div class="form-grid mt-15">

          <div class="form-field">
            <label>Início</label>
            <input
              class="input"
              type="time"
              id="simStart"
              value="${minutesToClock(sim.config.start)}"
            >
          </div>

          <div class="form-field">
            <label>Fim</label>
            <input
              class="input"
              type="time"
              id="simEnd"
              value="${minutesToClock(sim.config.end)}"
            >
          </div>

          <div class="form-field">
            <label>Docas</label>
            <input
              class="input"
              type="number"
              id="simDocks"
              min="1"
              max="30"
              value="${sim.config.dockCount}"
            >
          </div>

          <div class="form-field">
            <label>Balanças</label>
            <input
              class="input"
              type="number"
              id="simScales"
              min="1"
              max="10"
              value="${sim.config.scaleCount}"
            >
          </div>

          <div class="form-field">
            <label>Capacidade do pátio</label>
            <input
              class="input"
              type="number"
              id="simYard"
              min="1"
              max="200"
              value="${sim.config.yardCapacity}"
            >
          </div>

          <div class="form-field">
            <label>Empilhadeiras</label>
            <input
              class="input"
              type="number"
              id="simForklifts"
              min="1"
              max="30"
              value="${sim.config.forklifts}"
            >
          </div>

        </div>

        <div class="divider"></div>

        <h3>Eventos inesperados</h3>

        <div class="actions mt-15">

          <button
            class="btn btn-secondary btn-small"
            id="breakForklift"
          >
            🚜 Quebrar empilhadeira
          </button>

          <button
            class="btn btn-secondary btn-small"
            id="closeDock"
          >
            🚪 Fechar doca
          </button>

          <button
            class="btn btn-secondary btn-small"
            id="closeScale"
          >
            ⚖️ Parar balança
          </button>

          <button
            class="btn btn-secondary btn-small"
            id="addTraffic"
          >
            🚛 +20 caminhões
          </button>

        </div>

        <div class="divider"></div>

        <h3>Assistente</h3>

        <div class="ai-box mt-15">

          <p>
            Digite algo como:
            “simule 180 caminhões e feche a doca 3”.
          </p>

          <div class="ai-chat" id="simAiChat">

            <div class="ai-message assistant">
              Posso alterar parâmetros e criar cenários usando regras locais.
            </div>

          </div>

          <div class="ai-input">

            <input
              class="input"
              id="simAiInput"
              placeholder="Ex.: simule 180 caminhões"
            >

            <button
              class="btn btn-primary btn-small"
              id="simAiSend"
            >
              Enviar
            </button>

          </div>

        </div>

      </div>

      <div>

        <div class="sim-stage">

          <div class="sim-topbar">

            <div>
              <strong>SIMULAÇÃO OPERACIONAL</strong>
            </div>

            <div class="sim-clock">
              ${minutesToClock(sim.time)}
            </div>

            <div class="sim-speed">

              ${[1, 5, 10, 25, 50]
                .map(
                  (speed) => `
                    <button
                      class="speed-btn ${
                        sim.speed === speed ? 'active' : ''
                      }"
                      data-sim-speed="${speed}"
                    >
                      ${speed}x
                    </button>
                  `
                )
                .join('')}

            </div>

          </div>

          ${renderSimulationMap(sim)}

          <div class="sim-events">

            ${sim.events
              .slice(0, 30)
              .map(
                (event) => `
                  <div class="sim-event">
                    <time>${minutesToClock(event.time)}</time>
                    ${event.message}
                  </div>
                `
              )
              .join('')}

          </div>

        </div>

        <div class="actions mt-15">

          <button
            class="btn btn-primary"
            id="simPlayPause"
          >
            ${sim.running ? '⏸ Pausar' : '▶ Executar'}
          </button>

          <button
            class="btn btn-secondary"
            id="simStep"
          >
            +1 minuto
          </button>

          <button
            class="btn btn-secondary"
            id="simFinish"
          >
            ⏩ Executar até o final
          </button>

          <button
            class="btn btn-outline"
            id="simReset"
          >
            ↻ Reiniciar
          </button>

        </div>

        <div class="sim-kpis">

          <div class="sim-kpi">
            <strong>${r.finished}</strong>
            <span>Finalizados</span>
          </div>

          <div class="sim-kpi">
            <strong>${r.avgCycle} min</strong>
            <span>Tempo médio</span>
          </div>

          <div class="sim-kpi">
            <strong>${r.avgWait} min</strong>
            <span>Tempo ocioso</span>
          </div>

          <div class="sim-kpi">
            <strong>${r.maxQueue}</strong>
            <span>Fila máxima</span>
          </div>

          <div class="sim-kpi">
            <strong>${r.dockUse}%</strong>
            <span>Uso das docas</span>
          </div>

        </div>

      </div>

    </div>
  `;
}

function renderSimulationMap(sim) {
  const visible = sim.trucks
    .filter(
      (truck) =>
        truck.stage !== 'AGUARDANDO_CHEGADA' &&
        !truck.finished
    )
    .slice(0, 45);

  return `
    <div class="yard-map">

      <div
        class="map-building"
        style="
          left:55%;
          top:10%;
          width:38%;
          height:28%;
        "
      >
        GALPÃO / EXPEDIÇÃO
      </div>

      <div
        class="map-building"
        style="
          left:8%;
          top:13%;
          width:25%;
          height:19%;
        "
      >
        RECEBIMENTO
      </div>

      <div
        class="map-building"
        style="
          left:8%;
          bottom:9%;
          width:28%;
          height:20%;
        "
      >
        PÁTIO
      </div>

      <div
        class="map-road"
        style="
          left:0;
          top:48%;
          width:100%;
          height:11%;
        "
      ></div>

      <div
        class="map-road"
        style="
          left:42%;
          top:15%;
          width:8%;
          height:75%;
        "
      ></div>

      ${sim.docks
        .map(
          (dock, index) => `
            <div
              class="map-dock ${
                dock ? 'busy' : ''
              }"
              title="Doca ${index + 1}"
              style="
                left:${58 + (index % 6) * 5.5}%;
                top:${40 + Math.floor(index / 6) * 5}%;
              "
            ></div>
          `
        )
        .join('')}

      ${visible
        .map((truck, index) => {
          let left = 5;
          let top = 50;
          let cls = '';

          if (truck.stage === 'FILA_PORTARIA') {
            left = 3 + (index % 8) * 2.5;
            top = 48 + Math.floor(index / 8) * 3;
            cls = 'waiting';
          }

          else if (truck.stage === 'PORTARIA') {
            left = 23;
            top = 49;
            cls = 'operating';
          }

          else if (truck.stage === 'FILA_BALANCA') {
            left = 31 + (index % 5) * 2;
            top = 49;
            cls = 'waiting';
          }

          else if (truck.stage === 'PESAGEM') {
            left = 40;
            top = 49;
            cls = 'operating';
          }

          else if (truck.stage === 'PATIO') {
            left = 14 + (index % 6) * 3;
            top = 70 + Math.floor(index / 6) * 3;
            cls = 'waiting';
          }

          else if (truck.stage === 'OPERACAO') {
            left = 58 + ((truck.dock || 1) % 6) * 5.5;
            top = 39 + Math.floor((truck.dock || 1) / 6) * 5;
            cls = 'operating';
          }

          else if (truck.stage === 'CONFERENCIA') {
            left = 72;
            top = 57;
            cls = 'operating';
          }

          return `
            <div
              class="truck-dot ${cls}"
              title="${truck.plate} • ${truck.stage}"
              style="
                left:${left}%;
                top:${top}%;
              "
            ></div>
          `;
        })
        .join('')}

    </div>
  `;
}

/* =========================================================
   CONTROLE DO PLAYER
========================================================= */

function startSimulationLoop() {
  stopSimulationLoop();

  state.sim.running = true;

  simTimer = setInterval(() => {
    if (!state.sim || !state.sim.running) {
      return;
    }

    const steps = Math.max(
      1,
      Math.ceil(state.sim.speed / 5)
    );

    for (let i = 0; i < steps; i++) {
      runSimulationMinute(state.sim);
    }

    saveState();

    if (currentPage === 'simulacao') {
      render();
    }

    if (!state.sim.running) {
      stopSimulationLoop();
    }
  }, 450);
}

function stopSimulationLoop() {
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }

  if (state.sim) {
    state.sim.running = false;
  }
}

/* =========================================================
   EVENTOS DA SIMULAÇÃO
========================================================= */

function simulationBreakForklift() {
  if (!state.sim) return;

  state.sim.breakdowns.forkliftPenaltyUntil =
    state.sim.time + 60;

  simEvent(
    state.sim,
    'Empilhadeira indisponível por 60 minutos.'
  );

  toast(
    'Falha simulada',
    'Uma empilhadeira ficará indisponível por 60 minutos.',
    'warning'
  );

  saveState();
  render();
}

function simulationCloseDock() {
  if (!state.sim) return;

  const id = Number(
    prompt(
      `Qual doca deseja fechar? 1 a ${state.sim.config.dockCount}`,
      '3'
    )
  );

  if (
    !id ||
    id < 1 ||
    id > state.sim.config.dockCount
  ) {
    return;
  }

  state.sim.breakdowns.closedDocks.push({
    id,
    until: state.sim.time + 120
  });

  simEvent(
    state.sim,
    `Doca ${id} fechada por 120 minutos.`
  );

  toast(
    'Doca fechada',
    `Doca ${id} indisponível por 2 horas.`,
    'warning'
  );

  saveState();
  render();
}

function simulationCloseScale() {
  if (!state.sim) return;

  state.sim.breakdowns.scaleClosedUntil =
    state.sim.time + 60;

  simEvent(
    state.sim,
    'Balança indisponível por 60 minutos.'
  );

  toast(
    'Balança indisponível',
    'A pesagem ficará parada por 60 minutos.',
    'warning'
  );

  saveState();
  render();
}

function simulationAddTraffic() {
  if (!state.sim) return;

  const extra = generateSimulationTrucks({
    ...state.sim.config,
    truckCount: 20,
    seed: Date.now()
  });

  extra.forEach((truck, index) => {
    truck.id = `EXTRA-${Date.now()}-${index}`;
    truck.plate = `EXT${String(index + 1).padStart(3, '0')}`;

    truck.arrival =
      state.sim.time +
      Math.floor(index / 3) * 5;

    truck.stage = 'AGUARDANDO_CHEGADA';
    truck.stageStart = truck.arrival;
  });

  state.sim.trucks.push(...extra);

  simEvent(
    state.sim,
    'Foram adicionados 20 caminhões extras.'
  );

  toast(
    'Demanda aumentada',
    '20 caminhões foram adicionados ao cenário.',
    'warning'
  );

  saveState();
  render();
}

/* =========================================================
   ASSISTENTE LOCAL DA SIMULAÇÃO
========================================================= */

function processSimulationAssistant(text) {
  const command = String(text || '').toLowerCase();

  if (!command.trim()) {
    return 'Digite uma instrução.';
  }

  let response =
    'Comando entendido parcialmente. Posso alterar caminhões, docas e recursos.';

  const truckMatch = command.match(/(\d+)\s*caminh/);

  if (truckMatch) {
    const count = Number(truckMatch[1]);

    state.sim = createSimulation({
      ...state.sim?.config,
      truckCount: count
    });

    response =
      `Novo cenário criado com ${count} caminhões.`;
  }

  const dockMatch =
    command.match(/doca\s*(\d+)/);

  if (
    dockMatch &&
    (
      command.includes('feche') ||
      command.includes('fechar')
    )
  ) {
    const id = Number(dockMatch[1]);

    if (
      state.sim &&
      id >= 1 &&
      id <= state.sim.config.dockCount
    ) {
      state.sim.breakdowns.closedDocks.push({
        id,
        until: state.sim.time + 120
      });

      response +=
        ` A Doca ${id} foi fechada por 120 minutos.`;
    }
  }

  if (
    command.includes('duas docas') ||
    command.includes('2 docas')
  ) {
    const base =
      state.sim?.config.dockCount ||
      state.settings.dockCount;

    state.sim = createSimulation({
      ...state.sim?.config,
      dockCount: base + 2
    });

    response +=
      ` O cenário agora possui ${base + 2} docas.`;
  }

  if (
    command.includes('empilhadeira') &&
    (
      command.includes('quebre') ||
      command.includes('quebrar')
    )
  ) {
    if (state.sim) {
      state.sim.breakdowns.forkliftPenaltyUntil =
        state.sim.time + 60;
    }

    response +=
      ' Uma empilhadeira foi retirada da operação por 60 minutos.';
  }

  saveState();

  return response;
}

/* =========================================================
   CENÁRIOS "E SE?"
========================================================= */

function renderScenarios() {
  return `
    ${pageHead(
      'Cenários “E se?”',
      'Compare diferentes configurações antes de mudar a operação real.',
      `
        <button
          class="btn btn-primary"
          id="createScenario"
        >
          ＋ Criar cenário
        </button>
      `
    )}

    <div class="panel">

      <div class="panel-head">

        <div>
          <h3>Teste rápido</h3>
          <p>
            Use configurações predefinidas para comparar impactos.
          </p>
        </div>

      </div>

      <div class="panel-body">

        <div class="actions">

          <button
            class="btn btn-secondary"
            data-quick-scenario="traffic30"
          >
            +30% caminhões
          </button>

          <button
            class="btn btn-secondary"
            data-quick-scenario="twoDocks"
          >
            +2 docas
          </button>

          <button
            class="btn btn-secondary"
            data-quick-scenario="oneScale"
          >
            -1 balança
          </button>

          <button
            class="btn btn-secondary"
            data-quick-scenario="yard50"
          >
            +50% pátio
          </button>

        </div>

      </div>

    </div>

    ${
      state.scenarios.length
        ? `
          <div class="scenario-grid mt-20">

            ${state.scenarios
              .map(
                (scenario, index) => `
                  <div
                    class="scenario-card ${
                      index === 0 ? 'best' : ''
                    }"
                  >

                    <h3>${scenario.name}</h3>

                    <p class="muted small">
                      ${scenario.description}
                    </p>

                    <div class="scenario-metrics">

                      <div class="scenario-metric">
                        <strong>${scenario.results.avgCycle} min</strong>
                        <span>Tempo médio</span>
                      </div>

                      <div class="scenario-metric">
                        <strong>${scenario.results.avgWait} min</strong>
                        <span>Tempo ocioso</span>
                      </div>

                      <div class="scenario-metric">
                        <strong>${scenario.results.maxQueue}</strong>
                        <span>Fila máxima</span>
                      </div>

                      <div class="scenario-metric">
                        <strong>${scenario.results.dockUse}%</strong>
                        <span>Uso das docas</span>
                      </div>

                    </div>

                    <div class="mt-15">
                      <button
                        class="btn btn-outline btn-small"
                        data-delete-scenario="${scenario.id}"
                      >
                        Excluir
                      </button>
                    </div>

                  </div>
                `
              )
              .join('')}

          </div>

          ${renderScenarioComparison()}
        `
        : `
          <div class="empty-state mt-20">

            <h3>
              Nenhum cenário salvo
            </h3>

            <p>
              Crie um cenário para comparar resultados.
            </p>

          </div>
        `
    }
  `;
}

function renderScenarioComparison() {
  if (state.scenarios.length < 2) {
    return '';
  }

  return `
    <div class="panel mt-20">

      <div class="panel-head">

        <div>
          <h3>Comparação entre cenários</h3>
          <p>
            Menores tempos e filas representam melhor desempenho.
          </p>
        </div>

      </div>

      <div class="table-wrap">

        <table class="data-table compare-table">

          <thead>
            <tr>
              <th>Cenário</th>
              <th>Tempo médio</th>
              <th>Tempo ocioso</th>
              <th>Fila máxima</th>
              <th>Finalizados</th>
              <th>Uso das docas</th>
            </tr>
          </thead>

          <tbody>

            ${state.scenarios
              .map(
                (scenario) => `
                  <tr>
                    <td>
                      <strong>${scenario.name}</strong>
                    </td>

                    <td>${scenario.results.avgCycle} min</td>

                    <td>${scenario.results.avgWait} min</td>

                    <td>${scenario.results.maxQueue}</td>

                    <td>${scenario.results.finished}</td>

                    <td>${scenario.results.dockUse}%</td>
                  </tr>
                `
              )
              .join('')}

          </tbody>

        </table>

      </div>

    </div>
  `;
}

function createScenario(name, description, options) {
  const output = runSimulationToEnd(options);

  const scenario = {
    id: uid(),
    name,
    description,
    options,
    results: output.results
  };

  state.scenarios.unshift(scenario);

  state.scenarios = state.scenarios.slice(0, 12);

  registerHistory(
    `Cenário "${name}" criado.`
  );

  saveState();

  toast(
    'Cenário criado',
    `${name} foi simulado com sucesso.`
  );

  render();
}

function quickScenario(type) {
  const base = {
    truckCount: 100,
    dockCount: state.settings.dockCount,
    scaleCount: state.settings.scaleCount,
    yardCapacity: state.settings.yardCapacity,
    forklifts: state.settings.forklifts
  };

  if (type === 'traffic30') {
    createScenario(
      '+30% caminhões',
      'Aumento de demanda sem alteração física.',
      {
        ...base,
        truckCount: 130
      }
    );
  }

  else if (type === 'twoDocks') {
    createScenario(
      '+2 docas',
      'Cenário com duas novas docas.',
      {
        ...base,
        dockCount: base.dockCount + 2
      }
    );
  }

  else if (type === 'oneScale') {
    createScenario(
      'Uma balança indisponível',
      'Teste com capacidade de pesagem reduzida.',
      {
        ...base,
        scaleCount: Math.max(1, base.scaleCount - 1)
      }
    );
  }

  else if (type === 'yard50') {
    createScenario(
      'Pátio ampliado',
      'Capacidade do pátio aumentada em 50%.',
      {
        ...base,
        yardCapacity: Math.round(base.yardCapacity * 1.5)
      }
    );
  }
}

/* =========================================================
   GÊMEO DIGITAL
========================================================= */

function renderDigitalTwin() {
  return `
    ${pageHead(
      'Gêmeo Digital',
      'Modelo virtual demonstrativo da planta para testar alterações físicas.',
      `
        <button
          class="btn btn-primary"
          id="digitalAddDock"
        >
          ＋ Nova doca virtual
        </button>
      `
    )}

    <div class="digital-layout">

      <div class="digital-stage">

        <div class="digital-toolbar">

          <div class="digital-toolbar-group">

            <div class="tool-chip">
              🏭 Planta demonstrativa
            </div>

            <div class="tool-chip">
              ${state.settings.dockCount} docas
            </div>

          </div>

          <div class="digital-toolbar-group">

            <button
              class="tool-chip"
              id="digitalSimulate"
            >
              ▶ Simular esta planta
            </button>

          </div>

        </div>

        <div class="factory-3d">

          <div class="factory-ground"></div>

          <div
            class="factory-building"
            data-name="EXPEDIÇÃO"
            style="
              left:48%;
              top:10%;
              width:42%;
              height:28%;
            "
          ></div>

          <div
            class="factory-building"
            data-name="PRODUÇÃO"
            style="
              left:20%;
              top:18%;
              width:24%;
              height:32%;
            "
          ></div>

          <div
            class="factory-building"
            data-name="RECEBIMENTO"
            style="
              left:10%;
              top:58%;
              width:28%;
              height:20%;
            "
          ></div>

          <div
            class="factory-road"
            style="
              left:0;
              top:48%;
              width:100%;
              height:10%;
            "
          ></div>

          <div
            class="factory-road"
            style="
              left:42%;
              top:5%;
              width:8%;
              height:88%;
            "
          ></div>

          ${state.docks
            .map(
              (dock, index) => `
                <div
                  class="factory-dock ${
                    index >= 8 ? 'new' : ''
                  }"
                  title="Doca ${dock.id}"
                  style="
                    left:${51 + (index % 8) * 5}%;
                    top:${40 + Math.floor(index / 8) * 6}%;
                  "
                ></div>
              `
            )
            .join('')}

        </div>

      </div>

      <div class="digital-side">

        <div class="panel">

          <div class="panel-head">
            <h3>Editor de cenário</h3>
          </div>

          <div class="panel-body">

            <p class="muted small">
              Este modelo é demonstrativo. Em uma implantação real,
              a planta pode ser substituída por levantamento CAD/BIM,
              fotogrametria ou 3D Tiles.
            </p>

            <div class="divider"></div>

            <div class="form-field">

              <label>Docas virtuais</label>

              <input
                class="input"
                value="${state.settings.dockCount}"
                disabled
              >

            </div>

            <div class="form-field mt-15">

              <label>Capacidade do pátio</label>

              <input
                class="input"
                type="number"
                id="digitalYardCapacity"
                value="${state.settings.yardCapacity}"
              >

            </div>

            <button
              class="btn btn-primary mt-15"
              id="digitalApply"
            >
              Aplicar ao cenário
            </button>

          </div>

        </div>

        <div class="ai-box">

          <h3>🤖 Assistente de planta</h3>

          <p>
            Sugestões são testadas no simulador antes de serem aplicadas.
          </p>

          <div class="ai-chat">

            <div class="ai-message assistant">
              Posso comparar o efeito de ampliar o pátio ou adicionar docas.
            </div>

          </div>

          <div class="ai-input">

            <input
              class="input"
              id="digitalAiInput"
              placeholder="Ex.: adicione duas docas"
            >

            <button
              class="btn btn-primary btn-small"
              id="digitalAiSend"
            >
              Enviar
            </button>

          </div>

        </div>

      </div>

    </div>
  `;
}

/* =========================================================
   INDICADORES
========================================================= */

function renderIndicators() {
  const m = metrics();

  const latestScenario = state.scenarios[0];

  const bottlenecks = [
    {
      name: 'Docas',
      value: Math.max(
        0,
        state.alerts.filter(
          (a) =>
            a.stage === 'OPERACAO' ||
            a.stage === 'PATIO'
        ).length * 11
      )
    },

    {
      name: 'Pesagem',
      value: state.alerts.filter(
        (a) => a.stage === 'PESAGEM'
      ).length * 8
    },

    {
      name: 'Portaria',
      value: state.alerts.filter(
        (a) => a.stage === 'PORTARIA'
      ).length * 5
    },

    {
      name: 'Pátio',
      value: state.trucks.filter(
        (t) => t.status === 'PATIO'
      ).length * 6
    }
  ];

  const max = Math.max(
    1,
    ...bottlenecks.map((b) => b.value)
  );

  return `
    ${pageHead(
      'Indicadores',
      'KPIs de desempenho e gargalos da operação.'
    )}

    <div class="kpi-grid">

      ${kpi(
        '⏱️',
        'Tempo ocioso simulado',
        latestScenario
          ? `${latestScenario.results.avgWait} min`
          : '—'
      )}

      ${kpi(
        '🚛',
        'Veículos ativos',
        m.present
      )}

      ${kpi(
        '🚨',
        'Alertas ativos',
        state.alerts.length,
        state.alerts.length ? 'red' : 'green'
      )}

      ${kpi(
        '🏭',
        'Ocupação das docas',
        `${Math.round(
          (m.docks /
            Math.max(1, state.settings.dockCount)) *
            100
        )}%`
      )}

      ${kpi(
        '🅿️',
        'No pátio',
        state.trucks.filter(
          (t) => t.status === 'PATIO'
        ).length,
        'yellow'
      )}

      ${kpi(
        '✅',
        'Liberados',
        m.released,
        'green'
      )}

    </div>

    <div class="grid-2">

      <div class="panel">

        <div class="panel-head">

          <div>
            <h3>Gargalos identificados</h3>
            <p>
              Impacto relativo calculado com base nos alertas atuais.
            </p>
          </div>

        </div>

        <div class="panel-body">

          <div class="chart">

            ${bottlenecks
              .map(
                (b) => `
                  <div class="bar-item">

                    <div
                      class="bar"
                      style="
                        height:${30 + (b.value / max) * 180}px;
                      "
                    ></div>

                    <span>${b.name}</span>

                  </div>
                `
              )
              .join('')}

          </div>

        </div>

      </div>

      <div class="panel">

        <div class="panel-head">
          <h3>Top gargalos</h3>
        </div>

        <div class="panel-body">

          ${bottlenecks
            .sort((a, b) => b.value - a.value)
            .map(
              (item, index) => `
                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    padding:10px 0;
                    border-bottom:1px solid #eef1f4;
                  "
                >
                  <span>
                    ${index + 1}. ${item.name}
                  </span>

                  <strong>
                    +${item.value} min
                  </strong>
                </div>
              `
            )
            .join('')}

        </div>

      </div>

    </div>
  `;
}

/* =========================================================
   HISTÓRICO
========================================================= */

function renderHistory() {
  return `
    ${pageHead(
      'Histórico',
      'Rastreamento das principais ações realizadas no sistema.'
    )}

    <div class="panel">

      <div class="table-wrap">

        <table class="data-table">

          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Evento</th>
            </tr>
          </thead>

          <tbody>

            ${
              state.history.length
                ? state.history
                    .map(
                      (item) => `
                        <tr>
                          <td>${item.time}</td>
                          <td>${item.event}</td>
                        </tr>
                      `
                    )
                    .join('')
                : `
                  <tr>
                    <td colspan="2">
                      Nenhum evento registrado.
                    </td>
                  </tr>
                `
            }

          </tbody>

        </table>

      </div>

    </div>
  `;
}

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

function renderSettings() {
  return `
    ${pageHead(
      'Configurações',
      'Defina os parâmetros utilizados pela operação e pelos alertas.'
    )}

    <form class="panel" id="settingsForm">

      <div class="panel-head">
        <h3>Capacidade da unidade</h3>
      </div>

      <div class="panel-body">

        <div class="form-grid cols-3">

          <div class="form-field">
            <label>Docas</label>
            <input
              class="input"
              name="dockCount"
              type="number"
              min="1"
              value="${state.settings.dockCount}"
            >
          </div>

          <div class="form-field">
            <label>Balanças</label>
            <input
              class="input"
              name="scaleCount"
              type="number"
              min="1"
              value="${state.settings.scaleCount}"
            >
          </div>

          <div class="form-field">
            <label>Capacidade do pátio</label>
            <input
              class="input"
              name="yardCapacity"
              type="number"
              min="1"
              value="${state.settings.yardCapacity}"
            >
          </div>

          <div class="form-field">
            <label>Empilhadeiras</label>
            <input
              class="input"
              name="forklifts"
              type="number"
              min="1"
              value="${state.settings.forklifts}"
            >
          </div>

          <div class="form-field">
            <label>Portarias</label>
            <input
              class="input"
              name="gateCount"
              type="number"
              min="1"
              value="${state.settings.gateCount}"
            >
          </div>

        </div>

        <div class="divider"></div>

        <h3>Tempos máximos</h3>

        <div class="form-grid cols-3 mt-15">

          ${Object.entries(
            state.settings.stageLimits
          )
            .map(
              ([key, value]) => `
                <div class="form-field">
                  <label>${key}</label>
                  <input
                    class="input"
                    name="limit_${key}"
                    type="number"
                    min="1"
                    value="${value}"
                  >
                </div>
              `
            )
            .join('')}

        </div>

      </div>

      <div class="modal-foot">

        <button
          class="btn btn-primary"
          type="submit"
        >
          Salvar configurações
        </button>

      </div>

    </form>
  `;
}

/* =========================================================
   RENDER GERAL
========================================================= */

function render() {
  updateAlerts();

  const content = $('#content');

  if (currentPage === 'dashboard') {
    content.innerHTML = renderDashboard();
  }

  else if (currentPage === 'agendamentos') {
    content.innerHTML = renderScheduling();
  }

  else if (currentPage === 'operacao') {
    content.innerHTML = renderOperation();
  }

  else if (currentPage === 'docas') {
    content.innerHTML = renderDocks();
  }

  else if (currentPage === 'alertas') {
    content.innerHTML = renderAlerts();
  }

  else if (currentPage === 'simulacao') {
    content.innerHTML = renderSimulation();
  }

  else if (currentPage === 'cenarios') {
    content.innerHTML = renderScenarios();
  }

  else if (currentPage === 'gemeo') {
    content.innerHTML = renderDigitalTwin();
  }

  else if (currentPage === 'indicadores') {
    content.innerHTML = renderIndicators();
  }

  else if (currentPage === 'historico') {
    content.innerHTML = renderHistory();
  }

  else if (currentPage === 'configuracoes') {
    content.innerHTML = renderSettings();
  }

  bindPageEvents();
}

/* =========================================================
   EVENTOS DAS PÁGINAS
========================================================= */

function bindPageEvents() {
  $('#newSchedule')?.addEventListener(
    'click',
    openScheduleModal
  );

  $$('[data-next-stage]').forEach((button) => {
    button.onclick = () =>
      moveToNextStage(button.dataset.nextStage);
  });

  $$('[data-send-dock]').forEach((button) => {
    button.onclick = () =>
      sendTruckToDock(button.dataset.sendDock);
  });

  $$('[data-start-operation]').forEach((button) => {
    button.onclick = () =>
      startTruckOperation(button.dataset.startOperation);
  });

  $$('[data-finish-operation]').forEach((button) => {
    button.onclick = () =>
      finishTruckOperation(button.dataset.finishOperation);
  });

  $$('[data-change-dock]').forEach((button) => {
    button.onclick = () =>
      changeDock(button.dataset.changeDock);
  });

  $('#addVirtualDock')?.addEventListener(
    'click',
    () => {
      const nextId =
        Math.max(0, ...state.docks.map((d) => d.id)) + 1;

      state.docks.push({
        id: nextId,
        truckId: null
      });

      state.settings.dockCount =
        state.docks.length;

      registerHistory(
        `Doca ${nextId} adicionada ao cenário.`
      );

      saveState();
      render();
    }
  );

  $('#newSimulation')?.addEventListener(
    'click',
    () => {
      state.sim = createSimulation({
        truckCount: Number($('#simTruckCount')?.value || 100),
        start: timeToMinutes($('#simStart')?.value || '06:00'),
        end: timeToMinutes($('#simEnd')?.value || '18:00'),
        dockCount: Number($('#simDocks')?.value || state.settings.dockCount),
        scaleCount: Number($('#simScales')?.value || state.settings.scaleCount),
        yardCapacity: Number($('#simYard')?.value || state.settings.yardCapacity),
        forklifts: Number($('#simForklifts')?.value || state.settings.forklifts)
      });

      saveState();
      render();
    }
  );

  $('#simPlayPause')?.addEventListener(
    'click',
    () => {
      if (state.sim.running) {
        stopSimulationLoop();
        saveState();
        render();
      } else {
        startSimulationLoop();
      }
    }
  );

  $('#simStep')?.addEventListener(
    'click',
    () => {
      runSimulationMinute(state.sim);
      saveState();
      render();
    }
  );

  $('#simFinish')?.addEventListener(
    'click',
    () => {
      stopSimulationLoop();

      let guard = 0;

      while (
        state.sim &&
        !state.sim.trucks.every((t) => t.finished) &&
        guard < 5000
      ) {
        runSimulationMinute(state.sim);
        guard++;
      }

      saveState();
      render();

      toast(
        'Simulação concluída',
        'Todos os veículos possíveis foram processados.'
      );
    }
  );

  $('#simReset')?.addEventListener(
    'click',
    () => {
      stopSimulationLoop();

      state.sim = createSimulation(
        state.sim?.config || {}
      );

      saveState();
      render();
    }
  );

  $$('[data-sim-speed]').forEach((button) => {
    button.onclick = () => {
      state.sim.speed = Number(button.dataset.simSpeed);
      saveState();
      render();
    };
  });

  $('#breakForklift')?.addEventListener(
    'click',
    simulationBreakForklift
  );

  $('#closeDock')?.addEventListener(
    'click',
    simulationCloseDock
  );

  $('#closeScale')?.addEventListener(
    'click',
    simulationCloseScale
  );

  $('#addTraffic')?.addEventListener(
    'click',
    simulationAddTraffic
  );

  $('#simAiSend')?.addEventListener(
    'click',
    () => {
      const input = $('#simAiInput');

      if (!input) return;

      const text = input.value.trim();

      if (!text) return;

      const response =
        processSimulationAssistant(text);

      toast(
        'Assistente de simulação',
        response
      );

      input.value = '';

      render();
    }
  );

  $$('[data-quick-scenario]').forEach((button) => {
    button.onclick = () =>
      quickScenario(button.dataset.quickScenario);
  });

  $$('[data-delete-scenario]').forEach((button) => {
    button.onclick = () => {
      state.scenarios = state.scenarios.filter(
        (scenario) =>
          scenario.id !==
          Number(button.dataset.deleteScenario)
      );

      saveState();
      render();
    };
  });

  $('#createScenario')?.addEventListener(
    'click',
    () => {
      createScenario(
        `Cenário ${state.scenarios.length + 1}`,
        'Configuração atual da unidade.',
        {
          truckCount: 100,
          dockCount: state.settings.dockCount,
          scaleCount: state.settings.scaleCount,
          yardCapacity: state.settings.yardCapacity,
          forklifts: state.settings.forklifts
        }
      );
    }
  );

  $('#digitalAddDock')?.addEventListener(
    'click',
    () => {
      const nextId =
        Math.max(0, ...state.docks.map((d) => d.id)) + 1;

      state.docks.push({
        id: nextId,
        truckId: null
      });

      state.settings.dockCount =
        state.docks.length;

      registerHistory(
        `Nova doca virtual criada: Doca ${nextId}.`
      );

      saveState();

      toast(
        'Doca virtual adicionada',
        `A planta agora possui ${state.docks.length} docas.`
      );

      render();
    }
  );

  $('#digitalApply')?.addEventListener(
    'click',
    () => {
      const value = Number(
        $('#digitalYardCapacity')?.value ||
        state.settings.yardCapacity
      );

      state.settings.yardCapacity =
        Math.max(1, value);

      registerHistory(
        `Capacidade virtual do pátio alterada para ${state.settings.yardCapacity}.`
      );

      saveState();

      toast(
        'Cenário atualizado',
        'A capacidade do pátio foi alterada.'
      );

      render();
    }
  );

  $('#digitalSimulate')?.addEventListener(
    'click',
    () => {
      const result = runSimulationToEnd({
        truckCount: 100,
        dockCount: state.settings.dockCount,
        scaleCount: state.settings.scaleCount,
        yardCapacity: state.settings.yardCapacity,
        forklifts: state.settings.forklifts
      });

      createScenario(
        `Planta com ${state.settings.dockCount} docas`,
        'Simulação criada a partir do Gêmeo Digital.',
        {
          truckCount: 100,
          dockCount: state.settings.dockCount,
          scaleCount: state.settings.scaleCount,
          yardCapacity: state.settings.yardCapacity,
          forklifts: state.settings.forklifts
        }
      );
    }
  );

  $('#digitalAiSend')?.addEventListener(
    'click',
    () => {
      const input = $('#digitalAiInput');

      if (!input) return;

      const text = input.value.toLowerCase();

      if (
        text.includes('duas docas') ||
        text.includes('2 docas')
      ) {
        for (let i = 0; i < 2; i++) {
          const nextId =
            Math.max(0, ...state.docks.map((d) => d.id)) + 1;

          state.docks.push({
            id: nextId,
            truckId: null
          });
        }

        state.settings.dockCount =
          state.docks.length;

        saveState();

        toast(
          'Assistente de planta',
          'Duas docas virtuais foram adicionadas.'
        );

        render();

        return;
      }

      if (
        text.includes('aumente o pátio') ||
        text.includes('amplie o pátio')
      ) {
        state.settings.yardCapacity =
          Math.round(
            state.settings.yardCapacity * 1.3
          );

        saveState();

        toast(
          'Assistente de planta',
          'Capacidade do pátio aumentada em 30%.'
        );

        render();

        return;
      }

      toast(
        'Assistente de planta',
        'Tente: “adicione duas docas” ou “amplie o pátio”.',
        'warning'
      );
    }
  );

  $('#settingsForm')?.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      const data = new FormData(event.currentTarget);

      state.settings.dockCount =
        Math.max(1, Number(data.get('dockCount')) || 1);

      state.settings.scaleCount =
        Math.max(1, Number(data.get('scaleCount')) || 1);

      state.settings.yardCapacity =
        Math.max(1, Number(data.get('yardCapacity')) || 1);

      state.settings.forklifts =
        Math.max(1, Number(data.get('forklifts')) || 1);

      state.settings.gateCount =
        Math.max(1, Number(data.get('gateCount')) || 1);

      Object.keys(state.settings.stageLimits).forEach((key) => {
        state.settings.stageLimits[key] =
          Math.max(
            1,
            Number(data.get(`limit_${key}`)) ||
            state.settings.stageLimits[key]
          );
      });

      while (
        state.docks.length <
        state.settings.dockCount
      ) {
        const nextId =
          Math.max(0, ...state.docks.map((d) => d.id)) + 1;

        state.docks.push({
          id: nextId,
          truckId: null
        });
      }

      if (
        state.docks.length >
        state.settings.dockCount
      ) {
        const occupied = state.docks.filter(
          (d) => d.truckId
        );

        if (
          occupied.some(
            (d) => d.id > state.settings.dockCount
          )
        ) {
          toast(
            'Não foi possível remover docas',
            'Existem caminhões ocupando docas que seriam removidas.',
            'warning'
          );
        } else {
          state.docks =
            state.docks.slice(
              0,
              state.settings.dockCount
            );
        }
      }

      registerHistory(
        'Configurações operacionais alteradas.'
      );

      saveState();

      toast(
        'Configurações salvas',
        'Os novos parâmetros já estão ativos.'
      );

      render();
    }
  );
}

/* =========================================================
   PORTARIA RÁPIDA
========================================================= */

function openGateForScheduledTruck() {
  const scheduled =
    state.trucks.find(
      (t) => t.status === 'AGENDADO'
    );

  if (!scheduled) {
    return;
  }

  scheduled.status =
    'PORTARIA';

  scheduled.entry =
    nowClock();

  scheduled.stageStart =
    Date.now();

  registerHistory(
    `${scheduled.placa} teve entrada liberada pela portaria.`
  );

  saveState();
}

/* =========================================================
   EVENTOS GLOBAIS
========================================================= */

function bindGlobalEvents() {
  $$('#nav button[data-page]').forEach((button) => {
    button.onclick = () =>
      navTo(button.dataset.page);
  });

  $('#hamb')?.addEventListener(
    'click',
    () => {
      $('#sidebar').classList.toggle('open');
    }
  );

  $('#resetDemo')?.addEventListener(
    'click',
    () => {
      if (
        !confirm(
          'Deseja restaurar todos os dados demonstrativos?'
        )
      ) {
        return;
      }

      stopSimulationLoop();

      localStorage.removeItem(STORAGE_KEY);

      state = defaultState();

      currentPage = 'dashboard';

      saveState();

      toast(
        'Demonstração restaurada',
        'Todos os dados voltaram ao estado inicial.'
      );

      navTo('dashboard');
    }
  );
}

/* =========================================================
   ATUALIZAÇÃO AUTOMÁTICA DOS CRONÔMETROS
========================================================= */

setInterval(() => {
  if (
    ['dashboard', 'operacao', 'docas', 'alertas'].includes(
      currentPage
    )
  ) {
    render();
  }
}, 30000);

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {
    bindGlobalEvents();

    /*
      Se não houver nenhum veículo dentro da operação,
      mantemos os dados demonstrativos.
    */

    updateAlerts();

    render();
  }
);
