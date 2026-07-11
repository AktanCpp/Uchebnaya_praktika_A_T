/**
 * ЭкоМонитор КР — app.js
 * Автор: Тилегенов Актан Тилегенович
 *
 * Архитектура: IIFE (Immediately Invoked Function Expression).
 * Весь код обёрнут в самовызывающуюся функцию, чтобы ни одна
 * переменная не попала в глобальное пространство имён window.
 * Это полный аналог namespace {} в C++ или internal в C#.
 */
(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════
     1. КОНФИГУРАЦИЯ
     ════════════════════════════════════════════════════════ */

  // Базовый URL бэкенда. Поскольку FastAPI раздаёт и API, и статику
  // с одного и того же сервера, используем пустую строку —
  // запросы автоматически пойдут на тот же origin (хост + порт).
  const API_BASE = "";

  /* ═══════════════════════════════════════════════════════════
     2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ (State)
     ════════════════════════════════════════════════════════ */

  /**
   * Единственный объект состояния — аналог «хранилища» в SPA-фреймворках.
   * Хранить всё в одном месте удобно: любая функция читает/пишет сюда,
   * а не держит локальные копии данных.
   *
   * @property {Array}  allStations   — полный список станций из API (неизменяем после загрузки)
   * @property {string} searchQuery   — текущий текст из поля поиска
   * @property {string} activeParam   — активный фильтр по параметру ("" = все)
   */
  const state = {
    allStations: [],
    searchQuery: "",
    activeParam: "",
  };

  /* ═══════════════════════════════════════════════════════════
     3. КЭШИРОВАННЫЕ ССЫЛКИ НА DOM-ЭЛЕМЕНТЫ
     ════════════════════════════════════════════════════════ */

  /**
   * Запрашиваем каждый элемент один раз при инициализации.
   * Обращение к DOM — дорогая операция; кэш ускоряет работу
   * и делает код чище (нет повторяющихся querySelector).
   */
  const DOM = {
    // Header
    statusDot:    document.getElementById("status-dot"),
    statusLabel:  document.getElementById("status-label"),

    // Search & filters
    searchInput:  document.getElementById("search-input"),
    searchClear:  document.getElementById("search-clear"),
    filterRow:    document.getElementById("parameter-filters"),

    // Content
    grid:         document.getElementById("stations-grid"),
    resultsCount: document.getElementById("results-count"),
    emptyState:   document.getElementById("empty-state"),
    errorState:   document.getElementById("error-state"),

    // Modal fields
    modal:        document.getElementById("stationModal"),
    modalCode:    document.getElementById("modal-code"),
    modalName:    document.getElementById("modalStationName"),
    modalCity:    document.getElementById("modal-city"),
    modalLoc:     document.getElementById("modal-location"),
    modalLat:     document.getElementById("modal-lat"),
    modalLon:     document.getElementById("modal-lon"),
    modalParams:  document.getElementById("modal-params"),
    modalDesc:    document.getElementById("modal-description"),
    modalId:      document.getElementById("modal-id"),

    // Buttons
    resetBtn:     document.getElementById("reset-btn"),
    retryBtn:     document.getElementById("retry-btn"),
  };

  // Bootstrap Modal instance — создаём один раз, переиспользуем
  const bsModal = new bootstrap.Modal(DOM.modal);

  /* ═══════════════════════════════════════════════════════════
     4. УПРАВЛЕНИЕ UI-СОСТОЯНИЯМИ
     ════════════════════════════════════════════════════════ */

  /**
   * Переключает видимость блоков grid / empty-state / error-state.
   * Принимает строку-ключ: "grid" | "empty" | "error" | "loading"
   */
  function setView(view) {
    // Скрываем все три блока, затем показываем нужный
    DOM.grid.style.display       = "none";
    DOM.emptyState.hidden        = true;
    DOM.errorState.hidden        = true;

    if (view === "grid") {
      DOM.grid.style.display = ""; // возвращаем display из CSS (grid)
    } else if (view === "empty") {
      DOM.emptyState.hidden = false;
    } else if (view === "error") {
      DOM.errorState.hidden = false;
    }
    // "loading" — всё скрыто, счётчик покажет анимацию точек
  }

  /** Обновляет индикатор статуса API в шапке */
  function setApiStatus(status) {
    // Убираем все классы состояния и ставим нужный
    DOM.statusDot.classList.remove("online", "offline", "loading");

    if (status === "online") {
      DOM.statusDot.classList.add("online");
      DOM.statusLabel.textContent = "Онлайн";
    } else if (status === "offline") {
      DOM.statusDot.classList.add("offline");
      DOM.statusLabel.textContent = "Ошибка подключения";
    } else {
      // loading (по умолчанию при старте)
      DOM.statusDot.classList.add("loading");
      DOM.statusLabel.textContent = "Подключение…";
    }
  }

  /** Показывает анимированный счётчик во время загрузки */
  function setResultsLoading() {
    DOM.resultsCount.innerHTML =
      'Загрузка данных<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
  }

  /** Обновляет счётчик найденных результатов */
  function setResultsCount(n) {
    DOM.resultsCount.innerHTML =
      `Найдено объектов: <strong>${n}</strong>`;
  }

  /* ═══════════════════════════════════════════════════════════
     5. ЗАГРУЗКА ДАННЫХ С API
     ════════════════════════════════════════════════════════ */

  /**
   * async/await — синтаксический сахар над Promise.
   * В C# это прямой аналог async Task<T> / await.
   * Функция приостанавливается на await, не блокируя браузер,
   * и продолжается когда сервер вернул ответ.
   */
  async function fetchStations() {
    setApiStatus("loading");
    setResultsLoading();
    setView("loading");

    try {
      /**
       * fetch() — встроенный браузерный аналог HttpClient в C#.
       * Возвращает Promise<Response>. await «разворачивает» его
       * в объект Response, не блокируя поток выполнения.
       */
      const response = await fetch(`${API_BASE}/api/stations`);

      // HTTP-ошибки (4xx, 5xx) НЕ бросают исключений в fetch —
      // нужно проверять response.ok вручную.
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // .json() тоже асинхронный — читает тело ответа и парсит JSON
      const stations = await response.json();

      // Сохраняем полный список в состояние — он нам понадобится
      // при каждой клиентской фильтрации без повторных запросов к API
      state.allStations = stations;

      setApiStatus("online");
      applyFiltersAndRender(); // первый рендер

    } catch (error) {
      // Сюда попадаем при сетевой ошибке (сервер недоступен)
      // или если выше бросили throw вручную
      console.error("[ЭкоМонитор] Ошибка загрузки:", error.message);
      setApiStatus("offline");
      setView("error");
      DOM.resultsCount.innerHTML = "Данные недоступны";
    }
  }

  /* ═══════════════════════════════════════════════════════════
     6. ФИЛЬТРАЦИЯ (клиентская, мгновенная)
     ════════════════════════════════════════════════════════ */

  /**
   * Применяет оба фильтра к state.allStations и запускает рендер.
   * Вызывается при любом изменении: ввод в поиск, клик по чипу.
   *
   * Логика: station.parameters — массив строк (["CO2", "PM2.5", ...]).
   * Данные уже десериализованы из JSON бэкендом через Pydantic.
   */
  function applyFiltersAndRender() {
    const query = state.searchQuery.toLowerCase().trim();
    const param = state.activeParam.toLowerCase();

    const filtered = state.allStations.filter((station) => {
      // Проверка текстового поиска по трём полям
      const matchesSearch =
        !query ||
        station.name.toLowerCase().includes(query) ||
        station.city.toLowerCase().includes(query) ||
        station.location.toLowerCase().includes(query);

      // Проверка фильтра по параметру:
      // ищем подстроку в каждом элементе массива parameters
      const matchesParam =
        !param ||
        station.parameters.some((p) => p.toLowerCase().includes(param));

      // Станция попадает в результат только если ОБА условия верны
      return matchesSearch && matchesParam;
    });

    renderCards(filtered);
    setResultsCount(filtered.length);

    if (filtered.length === 0) {
      setView("empty");
    } else {
      setView("grid");
    }
  }

  /* ═══════════════════════════════════════════════════════════
     7. РЕНДЕРИНГ КАРТОЧЕК
     ════════════════════════════════════════════════════════ */

  /**
   * Генерирует HTML для одного чипа параметра.
   * Вынесено в отдельную функцию для читаемости.
   */
  function createParamTagHTML(param) {
    // Заменяем «температура» → «Температура» и т.д. для красоты
    const label = param.charAt(0).toUpperCase() + param.slice(1);
    return `<span class="param-tag">${label}</span>`;
  }

  /**
   * Генерирует HTML одной карточки из объекта станции.
   * Структура точно соответствует шаблону в index.html (Шаг 2).
   *
   * Template literals (`) — аналог $"..." в C# или fmt в C++.
   * data-station-id используется делегированием событий (см. раздел 8).
   * data-index нужен CSS-анимации из style.css (animation-delay).
   */
  function createCardHTML(station, index) {
    const paramTags = station.parameters.map(createParamTagHTML).join("");

    // Координаты форматируем до 4 знаков после запятой —
    // достаточно для точности ~11 м, стандарт картографических данных
    const lat = station.latitude.toFixed(4);
    const lon = station.longitude.toFixed(4);

    return `
      <article
        class="station-card glass-panel"
        role="listitem"
        data-station-id="${station.id}"
        data-index="${Math.min(index, 5)}"
        tabindex="0"
        aria-label="Открыть детали: ${station.name}"
      >
        <div class="card-header-row">
          <span class="station-code-badge">${station.code}</span>
          <span class="card-city">${station.city}</span>
        </div>

        <h2 class="station-name">${station.name}</h2>

        <div class="card-coords">
          <span class="coords-label">Координаты:</span>
          <span class="coords-value">${lat}° с.ш. / ${lon}° в.д.</span>
        </div>

        <p class="card-location">${station.location}</p>

        <p class="card-description">${station.description}</p>

        <div class="card-params" aria-label="Контролируемые параметры">
          ${paramTags}
        </div>

        <div class="card-footer-row">
          <button class="card-detail-btn" aria-label="Подробнее о станции ${station.code}">
            Подробнее <span aria-hidden="true">→</span>
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Принимает массив станций, очищает сетку и рендерит карточки.
   *
   * innerHTML = "" + insertAdjacentHTML — быстрее чем
   * удаление детей по одному через removeChild в цикле.
   */
  function renderCards(stations) {
    DOM.grid.innerHTML = "";

    if (stations.length === 0) return;

    // Собираем весь HTML одной строкой — один reflow вместо N
    const html = stations.map((s, i) => createCardHTML(s, i)).join("");
    DOM.grid.insertAdjacentHTML("beforeend", html);
  }

  /* ═══════════════════════════════════════════════════════════
     8. МОДАЛЬНОЕ ОКНО — заполнение данными
     ════════════════════════════════════════════════════════ */

  /**
   * Находит объект станции по ID и заполняет поля модального окна.
   * ID берём из data-station-id карточки (см. рендер выше).
   */
  function openStationModal(stationId) {
    // Array.find — аналог LINQ FirstOrDefault в C#
    const station = state.allStations.find((s) => s.id === stationId);
    if (!station) return;

    // Заполняем все поля модала
    DOM.modalCode.textContent = station.code;
    DOM.modalName.textContent = station.name;
    DOM.modalCity.textContent = station.city;
    DOM.modalLoc.textContent  = station.location;
    DOM.modalLat.textContent  = `${station.latitude.toFixed(6)}° с.ш.`;
    DOM.modalLon.textContent  = `${station.longitude.toFixed(6)}° в.д.`;
    DOM.modalDesc.textContent = station.description;
    DOM.modalId.textContent   = station.id;

    // Рендерим чипы параметров внутри модала (та же функция)
    DOM.modalParams.innerHTML = station.parameters
      .map(createParamTagHTML)
      .join("");

    // Программно открываем Bootstrap-модал
    bsModal.show();
  }

  /* ═══════════════════════════════════════════════════════════
     9. ОБРАБОТЧИКИ СОБЫТИЙ
     ════════════════════════════════════════════════════════ */

  /**
   * EVENT DELEGATION (Делегирование событий) на сетке карточек.
   *
   * Вместо того чтобы вешать addEventListener на каждую карточку
   * (что требует перевешивания при каждом ре-рендере), вешаем
   * ОДИН обработчик на родительский контейнер #stations-grid.
   *
   * Браузерная модель событий: события «всплывают» (bubble) от
   * дочернего элемента к родительскому. Клик по кнопке внутри
   * карточки → событие доходит до #stations-grid → мы его ловим.
   *
   * event.target — элемент, по которому кликнули.
   * .closest() — поднимается вверх по DOM-дереву и ищет
   * ближайшего предка с нужным селектором. Если клик был
   * по тексту внутри кнопки — .closest() всё равно найдёт карточку.
   */
  function initEventListeners() {

    // ── 9.1 Клик по карточке (делегирование) ──────────────────
    DOM.grid.addEventListener("click", (event) => {
      const card = event.target.closest(".station-card");
      if (!card) return; // клик был вне карточки — игнорируем

      // data-station-id хранится как строка; парсим в число
      // чтобы сравнение с station.id (number) работало корректно
      const id = parseInt(card.dataset.stationId, 10);
      openStationModal(id);
    });

    // Доступность: открытие модала по Enter/Space на карточке
    DOM.grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".station-card");
      if (!card) return;
      event.preventDefault();
      const id = parseInt(card.dataset.stationId, 10);
      openStationModal(id);
    });

    // ── 9.2 Живой поиск ───────────────────────────────────────
    DOM.searchInput.addEventListener("input", (event) => {
      state.searchQuery = event.target.value;

      // Показываем/скрываем кнопку очистки
      DOM.searchClear.hidden = state.searchQuery.length === 0;

      applyFiltersAndRender();
    });

    // ── 9.3 Кнопка очистки поля поиска ───────────────────────
    DOM.searchClear.addEventListener("click", () => {
      DOM.searchInput.value = "";
      DOM.searchClear.hidden = true;
      state.searchQuery = "";
      DOM.searchInput.focus();
      applyFiltersAndRender();
    });

    // ── 9.4 Фильтры по параметрам (делегирование на filterRow) ─
    /**
     * Снова делегирование: один обработчик на контейнер #parameter-filters,
     * а не на каждый .param-chip по отдельности.
     */
    DOM.filterRow.addEventListener("click", (event) => {
      const chip = event.target.closest(".param-chip");
      if (!chip) return;

      // Снимаем .active со всех чипов
      DOM.filterRow.querySelectorAll(".param-chip").forEach((c) => {
        c.classList.remove("active");
      });

      // Ставим .active на кликнутый
      chip.classList.add("active");

      // Читаем значение из data-param (пустая строка у чипа "Все")
      state.activeParam = chip.dataset.param;

      applyFiltersAndRender();
    });

    // ── 9.5 Сброс фильтров (empty-state) ─────────────────────
    DOM.resetBtn.addEventListener("click", resetFilters);

    // ── 9.6 Повторная загрузка (error-state) ──────────────────
    DOM.retryBtn.addEventListener("click", fetchStations);
  }

  /* ═══════════════════════════════════════════════════════════
     10. СБРОС ФИЛЬТРОВ
     ════════════════════════════════════════════════════════ */

  function resetFilters() {
    // Сбрасываем состояние
    state.searchQuery = "";
    state.activeParam = "";

    // Сбрасываем UI
    DOM.searchInput.value = "";
    DOM.searchClear.hidden = true;

    // Возвращаем чипу "Все" класс active
    DOM.filterRow.querySelectorAll(".param-chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.param === "");
    });

    applyFiltersAndRender();
  }

  /* ═══════════════════════════════════════════════════════════
     11. ИНИЦИАЛИЗАЦИЯ — ТОЧКА ВХОДА
     ════════════════════════════════════════════════════════ */

  /**
   * DOMContentLoaded — событие, которое браузер генерирует когда
   * HTML полностью разобран и DOM построен, но внешние ресурсы
   * (картинки, шрифты) ещё могут грузиться.
   * Это правильный момент для старта JS-логики —
   * аналог статического конструктора или точки входа main().
   *
   * Порядок инициализации важен:
   * 1. Сначала вешаем обработчики — они не зависят от данных
   * 2. Потом делаем сетевой запрос — он асинхронный
   */
  document.addEventListener("DOMContentLoaded", () => {
    initEventListeners();
    fetchStations();
  });

})(); // конец IIFE — функция немедленно вызывает сама себя
