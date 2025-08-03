document.addEventListener('DOMContentLoaded', () => {
    // --- AGGREGATOR RULES MODAL LOGIC ---
    const aggregatorModal = document.getElementById('aggregator-rules-modal');
    const aggregatorAgreeButton = document.getElementById('aggregator-agree-button');

    if (aggregatorModal && aggregatorAgreeButton) {
        const hasAgreed = localStorage.getItem('aggregatorRulesAgreed');
        // Показуємо вікно, якщо користувач ще не погодився, додаючи клас
        if (hasAgreed !== 'true') {
            aggregatorModal.classList.add('visible');
        }

        aggregatorAgreeButton.addEventListener('click', () => {
            localStorage.setItem('aggregatorRulesAgreed', 'true');

            // Приховуємо вікно, видаляючи клас
            aggregatorModal.classList.remove('visible');
        });
    }
    // --- END OF AGGREGATOR RULES MODAL LOGIC ---

    // Елементи DOM
    const searchInput = document.getElementById('searchInput');
    const newsContainer = document.getElementById('news-container');
    const siteFilterContainer = document.getElementById('site-filter-container');
    const startDateInput = document.getElementById('start-date-input');
    const endDateInput = document.getElementById('end-date-input');
    const typeFilterContainer = document.getElementById('type-filter-container');
    const sortingSidebar = document.getElementById('sorting-sidebar');
    const loadMoreBtn = document.getElementById('load-more-btn');

    let searchTimeout;
    let dateChangeTimeout;

    let currentOffset = 0;
    const NEWS_LIMIT = 150;

    const logoMap = {
        "IFactor": "data/sites-logos/IFactor_logo.png",
        "Бухгалтер 911": "data/sites-logos/Бухгалтер911_logo.png",
        "Головбух": "data/sites-logos/Головбух_logo.png",
        "Держзакупівлі": "data/sites-logos/Держзакупівлі_logo.png",
        "Дебет-Кредит": "data/sites-logos/Дебет-Кредит_logo.png",
        "Кадрекс Профпреса": "data/sites-logos/Кадрекс_logo.png",
        "Кадроленд": "data/sites-logos/Кадроленд_logo.png",
        "Семінар": "data/sites-logos/Семінар_logo.png",
        "Облік-бюджет": "data/sites-logos/ОблікБюджет_logo.png",
        "Охорона Праці": "data/sites-logos/ОхоронаПраці_logo.png",
        "ПроКадри": "data/sites-logos/ПроКадри_logo.png",
        "Фактор Академія": "data/sites-logos/Фактор_Академія_logo.png",
    };

    function parseDateString(str) {
        const dateStr = str.trim();
        let day, month, year;
        const convertTwoDigitYear = (yy) => `20${yy}`;
        if (dateStr.length === 10) {
            if (dateStr.includes('.') && dateStr.split('.').length === 3) {
                [day, month, year] = dateStr.split('.');
            } else if (dateStr.includes('-') && dateStr.split('-').length === 3) {
                [day, month, year] = dateStr.split('-');
            }
        } else if (dateStr.length === 8) {
            if (dateStr.includes('.') && dateStr.split('.').length === 3) {
                [day, month, year] = dateStr.split('.');
                if (year?.length === 2) year = convertTwoDigitYear(year);
            } else if (dateStr.includes('-') && dateStr.split('-').length === 3) {
                [day, month, year] = dateStr.split('-');
                if (year?.length === 2) year = convertTwoDigitYear(year);
            } else if (/^\d{8}$/.test(dateStr)) {
                day = dateStr.substring(0, 2);
                month = dateStr.substring(2, 4);
                year = dateStr.substring(4, 8);
            }
        } else if (dateStr.length === 6 && /^\d{6}$/.test(dateStr)) {
            day = dateStr.substring(0, 2);
            month = dateStr.substring(2, 4);
            year = dateStr.substring(4, 6);
            if (year?.length === 2) year = convertTwoDigitYear(year);
        }
        if (day && month && year && year.length === 4) {
            const d = parseInt(day, 10), m = parseInt(month, 10), y = parseInt(year, 10);
            if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m > 0 && m <= 12 && d > 0 && d <= 31 && y > 1900 && y < 2100) {
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        }
        return null;
    }

    // --- ФІЛЬТР ЗА САЙТАМИ ---
    function populateSiteFilters() {
        // Створюємо чекбокс "Всі"
        const selectAllLabel = document.createElement('label');
        selectAllLabel.style.fontWeight = 'bold';
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.id = 'select-all-sites'; // Даємо унікальний ID
        selectAllCheckbox.checked = true;

        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(document.createTextNode(' Всі сайти'));
        siteFilterContainer.appendChild(selectAllLabel);

        // Додаємо розділювач для краси
        const separator = document.createElement('hr');
        separator.style.margin = '10px 0';
        separator.style.border = 'none';
        separator.style.borderTop = '1px solid var(--border-color)';
        siteFilterContainer.appendChild(separator);

        // Створюємо чекбокси для кожного сайту
        Object.keys(logoMap).forEach(site => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = site;
            checkbox.checked = true;
            checkbox.classList.add('site-checkbox'); // Додаємо клас для легкого доступу
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${site}`));
            siteFilterContainer.appendChild(label);
        });
    }

   async function loadNews(filters, isLoadMore = false) {
        if (!isLoadMore) {
            newsContainer.innerHTML = '<p style="text-align:center;">⏳ Завантаження новин...</p>';
        }
        loadMoreBtn.disabled = true; // Блокуємо кнопку на час завантаження

        const params = new URLSearchParams();
        if (filters.query) params.append('search', filters.query);
        if (filters.sites && filters.sites.length > 0) params.append('sites', filters.sites.join(','));
        if (filters.startDate) params.append('start_date', filters.startDate);
        if (filters.endDate) params.append('end_date', filters.endDate);
        if (filters.types && filters.types.length > 0) params.append('types', filters.types.join(','));
        if (filters.sortBy) {
            params.append('sort_by', filters.sortBy);
            if (filters.sortOrder) {
                params.append('sort_order', filters.sortOrder);
            }
        }
        // Додаємо параметри пагінації
        params.append('limit', NEWS_LIMIT);
        params.append('offset', filters.offset);

        const dataSource = 'all';

        try {
            const response = await fetch(`http://95.158.51.249:5000/api/news/${dataSource}?${params.toString()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const news = await response.json();

            displayNews(news, isLoadMore);

            // Керуємо видимістю кнопки "Завантажити ще"
            if (news.length < NEWS_LIMIT) {
                loadMoreBtn.style.display = 'none'; // Ховаємо, якщо новин більше немає
            } else {
                loadMoreBtn.style.display = 'block'; // Показуємо, якщо можуть бути ще новини
            }
        } catch (error) {
            console.error("Помилка завантаження:", error);
            newsContainer.innerHTML = '<p style="text-align:center;">❌ Не вдалося завантажити дані.</p>';
        } finally {
            loadMoreBtn.disabled = false; // Розблоковуємо кнопку після завантаження
        }
    }

    // --- ОНОВЛЕНО: Функція відображення новин ---
    function displayNews(news, isLoadMore) {
        if (!isLoadMore) {
            newsContainer.innerHTML = ''; // Очищуємо контейнер тільки при новому пошуку
        }

        if (news.length === 0 && !isLoadMore) {
            newsContainer.innerHTML = '<p style="text-align:center;">За вашими критеріями новин не знайдено.</p>';
            return;
        }

        const typeMap = { 'С': 'Стаття', 'Н': 'Новина' };

        news.forEach(item => {
            const logoSrc = logoMap[item.site] || 'data/logos/placeholder.png';
            const card = document.createElement('a');
            card.className = 'news-card';
            card.href = item.url;
            card.target = '_blank';
            const date = new Date(item.date_pub);
            const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
            const formattedDate = date.toLocaleDateString('uk-UA', options);
            const itemType = typeMap[item.type] || '';

            card.innerHTML = `
                <h3 class="news-title">${item.title}</h3>
                <div class="news-footer">
                    <div class="news-source">
                        <img src="${logoSrc}" alt="${item.site}" class="news-logo">
                        <span class="source-name">${item.site}</span>
                    </div>
                    <span class="news-type-display">${itemType}</span>
                    <span class="news-date">${formattedDate}</span>
                </div>
            `;
            newsContainer.appendChild(card);
        });
    }

    // --- ОНОВЛЕНО: Функція збору фільтрів ---
    function applyFiltersAndLoadNews(isLoadMore = false) {
        if (!isLoadMore) {
            currentOffset = 0; // Скидаємо лічильник при новому пошуку/фільтрації
        } else {
            currentOffset += NEWS_LIMIT; // Збільшуємо зсув для дозавантаження
        }

        const query = searchInput.value;
        const selectedSites = Array.from(siteFilterContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        const selectedTypes = typeFilterContainer ? Array.from(typeFilterContainer.querySelectorAll('input:checked')).map(cb => cb.value) : [];

        const rawStartDate = startDateInput.value;
        const rawEndDate = endDateInput.value;
        const startDate = rawStartDate ? parseDateString(rawStartDate) : '';
        const endDate = rawEndDate ? parseDateString(rawEndDate) : '';

        const sortOption = sortingSidebar.querySelector('input[name="sort_option"]:checked')?.value || 'date_pub_desc';

        const filters = {
            query,
            sites: selectedSites,
            startDate,
            endDate,
            types: selectedTypes,
            offset: currentOffset // Додаємо зсув до об'єкта фільтрів
        };

        if (sortOption !== 'default') {
            const [sortBy, sortOrder] = sortOption.split('_');
            filters.sortBy = sortBy;
            filters.sortOrder = sortOrder;
        }

        if ((!rawStartDate || startDate) && (!rawEndDate || endDate)) {
            loadNews(filters, isLoadMore);
        }
    }

    const handleDateChange = () => {
        clearTimeout(dateChangeTimeout);
        dateChangeTimeout = setTimeout(() => {
            [startDateInput, endDateInput].forEach(input => {
                const rawValue = input.value;
                if (rawValue && !parseDateString(rawValue)) {
                    input.classList.add('input-error');
                } else {
                    input.classList.remove('input-error');
                }
            });
            applyFiltersAndLoadNews();
        }, 1000);
    };

    function setupCalendarInteraction(icon, input) {
        icon.addEventListener('click', () => {
            const parsedDate = parseDateString(input.value);
            input.value = parsedDate;
            input.type = 'date';
            try {
                input.showPicker();
            } catch (e) {
                input.focus();
            }
        });
        input.addEventListener('change', () => {
            const dateValue = input.value;
            input.type = 'text';
            if (dateValue && dateValue.includes('-')) {
                const [year, month, day] = dateValue.split('-');
                if (day && month && year) {
                   input.value = `${day}.${month}.${year}`;
                }
            }
            handleDateChange();
        });
        input.addEventListener('blur', () => {
            if (input.type === 'date') {
                input.type = 'text';
            }
        });
    }

    // --- ІНІЦІАЛІЗАЦІЯ ТА ОБРОБНИКИ ПОДІЙ ---
    populateSiteFilters();

    if (typeFilterContainer) {
        typeFilterContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = true;
        });
    }

    applyFiltersAndLoadNews(); // Перше завантаження новин

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => applyFiltersAndLoadNews(false), 500);
    });

    siteFilterContainer.addEventListener('change', (event) => {
        const selectAllCheckbox = document.getElementById('select-all-sites');
        const siteCheckboxes = Array.from(siteFilterContainer.querySelectorAll('.site-checkbox'));

        // Перевіряємо, чи клік був по чекбоксу "Всі"
        if (event.target.id === 'select-all-sites') {
            // Встановлюємо стан всіх інших чекбоксів таким же, як у "Всі"
            siteCheckboxes.forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
            });
        } else {
            // Інакше, перевіряємо, чи всі сайти вибрані, і оновлюємо "Всі"
            const allSitesChecked = siteCheckboxes.every(cb => cb.checked);
            selectAllCheckbox.checked = allSitesChecked;
        }

        // Запускаємо завантаження новин з новими фільтрами
        applyFiltersAndLoadNews(false);
    });

    if (typeFilterContainer) {
        typeFilterContainer.addEventListener('change', () => applyFiltersAndLoadNews(false));
    }
    if (sortingSidebar) {
        sortingSidebar.addEventListener('change', () => applyFiltersAndLoadNews(false));
    }
    startDateInput.addEventListener('input', handleDateChange);
    endDateInput.addEventListener('input', handleDateChange);

    setupCalendarInteraction(startDateInput.nextElementSibling, startDateInput);
    setupCalendarInteraction(endDateInput.nextElementSibling, endDateInput);

    // --- НОВИЙ ОБРОБНИК для кнопки "Завантажити ще" ---
    loadMoreBtn.addEventListener('click', () => {
        applyFiltersAndLoadNews(true); // Викликаємо функцію з прапором дозавантаження
    });
});