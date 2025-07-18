import { loadHolidays, calculateSummary } from './work_time.js';
import { FONT_BASE_64 } from './data/font-data.js';
import { auth, incrementCounter } from './data/firebase-config.js';

let lastCalculationData = null;
let flyoutNavClickCount = 0;
let isSecretThemeUnlocked = false;

function applyTemplate(templateSelect, dayInputs) {
    const template = templateSelect.value;
    if (!template) return;
    const values = template.split(",").map(v => parseFloat(v) || 0);
    dayInputs.forEach((input, i) => {
        input.value = values[i] !== undefined ? values[i] : 0;
    });
    validateAllInputs(dayInputs);
}

function make(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
}

function formatHours(num) {
    const fixed = (+num).toFixed(1);
    return parseFloat(fixed);
}

function validateAllInputs(dayInputs) {
    const showBtn = document.getElementById("showBtn");
    const buttonWrapper = document.getElementById("button-wrapper");
    const tooltipContainer = document.querySelector('.tooltip-icon-container');
    if (!showBtn) return;

    let totalHours = 0;
    let hasInvalidInput = false;
    let validationErrorMessages = [];
    const hoursArray = Array.from(dayInputs, input => parseFloat(input.value) || 0);

    hoursArray.forEach((value, i) => {
        const input = dayInputs[i];
        totalHours += isNaN(value) ? 0 : value;
        if (isNaN(value) || value < 0 || value > 24) {
            hasInvalidInput = true;
            input.classList.add('input-error');
            input.title = 'Години мають бути в діапазоні від 0 до 24.';
        } else {
            input.classList.remove('input-error');
            input.title = '';
        }
    });

    const longDaysCount = hoursArray.filter(h => h >= 8).length;
    const preHolidaysAreCalculated = (totalHours >= 40 || longDaysCount >= 2);
    if (tooltipContainer) {
         tooltipContainer.style.display = preHolidaysAreCalculated ? 'none' : 'inline-flex';
    }

    if (hasInvalidInput) {
        validationErrorMessages.push('Неправильне введення годин (допустимо від 0 до 24).');
    }
    if (totalHours < 5) {
        validationErrorMessages.push('Загальна кількість годин на тиждень має бути не менше 5.');
    }

    if (validationErrorMessages.length > 0) {
        showBtn.disabled = true;
        buttonWrapper.title = validationErrorMessages[0];
    } else {
        showBtn.disabled = false;
        buttonWrapper.title = '';
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function autoExpandColumns() {
    const table = document.getElementById('results');
    const wrapper = document.querySelector('.table-wrapper');
    const headRow = document.querySelector('#results-head tr');
    const bodyRows = document.querySelectorAll('#results-body tr');

    if (!table || !headRow || !wrapper) return;

    document.querySelectorAll('.expanded-col').forEach(el => el.classList.remove('expanded-col'));
    await delay(50);

    const columnCount = headRow.children.length - 1;

    for (let i = 1; i < columnCount; i++) {
        if (table.scrollWidth >= wrapper.clientWidth - 15) break;

        const headerCell = headRow.children[i];
        if (headerCell) headerCell.classList.add('expanded-col');
        bodyRows.forEach(row => { if (row.children[i]) row.children[i].classList.add('expanded-col'); });
        await delay(450);
    }
}

function showTableLayout() {
    const showBtn = document.getElementById("showBtn");
    if (showBtn.disabled) return;

    const year = parseInt(document.getElementById("year").value);
    const selected = document.getElementById("month").value;
    const ignoreHolidays = document.getElementById("ignoreHolidays").checked;
    const hours = Array.from(document.querySelectorAll(".day")).map(e => parseFloat(e.value) || 0);

    const currentCalculationData = { year, selected, hours: JSON.stringify(hours), ignoreHolidays };
    if (JSON.stringify(currentCalculationData) !== JSON.stringify(lastCalculationData)) {
        console.log("[UI Log] Кнопка 'Розрахувати' натиснута. Викликаю incrementCounter.");
        incrementCounter('calculations');
    }

    lastCalculationData = currentCalculationData;

    const data = calculateSummary(year, selected, hours, ignoreHolidays);
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    const head = document.getElementById("results-head");
    const body = document.getElementById("results-body");
    head.innerHTML = "";
    body.innerHTML = "";

    const months = Object.keys(data).map(n => parseInt(n));
    const headerRow = document.createElement("tr");
    headerRow.appendChild(make("th", " "));
    months.forEach(m => headerRow.appendChild(make("th", monthNames[m - 1])));
    if (selected === "0" || selected.startsWith("Q")) {
         headerRow.appendChild(make("th", "Загалом"));
    }
    head.appendChild(headerRow);

    const rows = [
        ["calendar", "Календарні дні"], ["holiday", "Святкові дні"], ["holidayRawDates", "Дати святкових днів"],
        ["preholiday", "Передсвяткові дні"], ["preholidayDates", "Дати передсвяткових днів"], ["weekend", "Вихідні дні"],
        ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
    ];
    const holidayKeys = new Set(['holiday', 'holidayRawDates', 'preholiday', 'preholidayDates']);
    const nonNumericTotalKeys = new Set(['holidayRawDates', 'preholidayDates']);

    for (const [key, label] of rows) {
        if (ignoreHolidays && holidayKeys.has(key)) {
            continue;
        }

        const tr = document.createElement("tr");
        const labelCell = document.createElement('td');
        const arrow = document.createElement('span');
        arrow.className = 'row-selector-arrow';
        arrow.title = 'Виділити рядок';
        labelCell.textContent = label;
        labelCell.prepend(arrow);
        tr.appendChild(labelCell);

        let total = 0;

        for (const m of months) {
            let val = data[m][key];
            let displayVal;

            if (key === 'holiday' && data[m]['holidayRawDates']) {
                val = data[m]['holidayRawDates'].length;
            }

            if (Array.isArray(val)) {
                displayVal = val.join(", ") || "-";
            } else {
                total += val;
                if (key === 'hours') {
                    displayVal = formatHours(val);
                } else {
                    displayVal = (val === 0) ? "-" : val;
                }
            }
            tr.appendChild(make("td", displayVal));
        }

        if (selected === "0" || selected.startsWith("Q")) {
            if (nonNumericTotalKeys.has(key)) {
                tr.appendChild(make("td", "-"));
            } else {
                let displayTotal;
                 if (key === 'hours') {
                    displayTotal = formatHours(total);
                } else {
                    displayTotal = (total === 0) ? "-" : total;
                }
                tr.appendChild(make("td", String(displayTotal)));
            }
        }
        body.appendChild(tr);
    }
    document.getElementById("results-wrapper").style.display = "block";
    document.getElementById('downloadPdfBtn').style.display = 'block';
    autoExpandColumns();
}

/**
 * Зчитує CSS-змінні поточної теми для використання в PDF.
 * @returns {object} Об'єкт з кольорами для PDF.
 */
function getThemeColorsForPdf() {
    const computedStyles = getComputedStyle(document.documentElement);

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
    };

    return {
        pageColor: hexToRgb(computedStyles.getPropertyValue('--page-bg')),
        textColor: hexToRgb(computedStyles.getPropertyValue('--pdf-text-color')),
        headerFillColor: hexToRgb(computedStyles.getPropertyValue('--header-bg')),
        headerTextColor: hexToRgb(computedStyles.getPropertyValue('--header-text')),
        gridColor: hexToRgb(computedStyles.getPropertyValue('--grid-color')),
        cellFillColor: hexToRgb(computedStyles.getPropertyValue('--pdf-cell-bg')), // Нове
        linkColor: hexToRgb(computedStyles.getPropertyValue('--pdf-link-color'))   // Нове
    };
}

function formatPdfHours(decimalHours) {
    const num = parseFloat(decimalHours);
    if (isNaN(num)) return "0 год.";
    if (num === 0) return "0 год.";
    const hours = Math.floor(num);
    const minutes = Math.round((num % 1) * 60);
    let result = "";
    if (hours > 0) result += `${hours} год. `;
    if (minutes > 0) result += `${minutes} хв.`;
    return result.trim();
}

function formatWeeklyHours(decimalHours) {
    const num = parseFloat(decimalHours);
    if (isNaN(num) || num <= 0) return "0 годин";
    const hours = Math.floor(num);
    const minutes = Math.round((num % 1) * 60);
    let result = "";
    if (hours > 0) result += `${hours} годин `;
    if (minutes > 0) result += `${minutes} хвилин`;
    return result.trim();
}

async function downloadPdf() {
    console.log("[UI Log] Кнопка 'Завантажити' натиснута. Викликаю incrementCounter.");
    incrementCounter('downloads');

    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (!lastCalculationData) {
        alert("Спочатку розрахуйте таблицю.");
        return;
    }
    if (!FONT_BASE_64 || FONT_BASE_64.startsWith("Сюди")) {
        alert("Помилка: Дані шрифту не були вставлені у файл font-data.js.");
        return;
    }

    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = 'Генерація PDF...';

    try {
        const { jsPDF } = window.jspdf;
        const newHeight = 160;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, newHeight] });

        doc.addFileToVFS("CustomFont.ttf", FONT_BASE_64);
        doc.addFont("CustomFont.ttf", "CustomFont", "normal");
        doc.setFont("CustomFont");

        let logoData = null;
        try {
            const response = await fetch('./data/Tantrum-logo.png');
            if (response.ok) {
                const logoBlob = await response.blob();
                logoData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(logoBlob);
                });
            } else {
                console.warn("Не вдалося завантажити логотип.");
            }
        } catch (e) {
            console.warn("Помилка при завантаженні логотипу:", e);
        }

        const applyThemeToPdf = document.getElementById('pdf-theme-checkbox').checked;

        let pdfColors;
        const defaultColors = {
            pageColor: [255, 255, 255],
            textColor: [0, 0, 0],
            headerFillColor: [22, 160, 133],
            headerTextColor: [255, 255, 255],
            gridColor: [200, 200, 200],
            cellFillColor: [255, 255, 255], // Нове
            linkColor: [0, 0, 255]           // Нове
        };

        if (applyThemeToPdf) {
            pdfColors = getThemeColorsForPdf();
        } else {
            pdfColors = defaultColors;
        }

        const { year, selected, ignoreHolidays } = lastCalculationData;
        const hours = JSON.parse(lastCalculationData.hours);
        const data = calculateSummary(year, selected, hours, ignoreHolidays);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        if (pdfColors.pageColor[0] !== 255 || pdfColors.pageColor[1] !== 255 || pdfColors.pageColor[2] !== 255) {
            doc.setFillColor(...pdfColors.pageColor);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
        }

        doc.setTextColor(...pdfColors.textColor);

        const workingDaysCount = hours.filter(h => h > 0).length;
        const totalWeeklyHours = hours.reduce((acc, h) => acc + (parseFloat(h) || 0), 0);
        const weeklyHoursFormatted = formatWeeklyHours(totalWeeklyHours);
        const dayNames = ["Пн.", "Вт.", "Ср.", "Чт.", "Пт.", "Сб.", "Нд."];
        const title = `Норма робочого часу за ${year} рік за ${workingDaysCount}-денного робочого тижня (${weeklyHoursFormatted} на тиждень)`;
        const subtitle = `(Графік роботи: ${hours.map((h, i) => `${dayNames[i]} - ${formatPdfHours(h)}`).join(', ')})`;

        doc.setFontSize(16);
        doc.text(title, pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(subtitle, pageWidth / 2, 22, { align: 'center' });

        const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
        const months = Object.keys(data).map(n => parseInt(n));
        const tableHead = [" ", ...months.map(m => monthNames[m - 1])];
        if (selected === "0" || selected.startsWith("Q")) {
            tableHead.push("Загалом");
        }

        let rowConfigs;
        if (ignoreHolidays) {
            rowConfigs = [
                ["calendar", "Календарні дні"], ["weekend", "Вихідні дні"],
                ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
            ];
        } else {
            rowConfigs = [
                ["calendar", "Календарні дні"], ["holiday", "Святкові дні"], ["holidayRawDates", "Дати святкових днів"],
                ["preholiday", "Передсвяткові дні"], ["preholidayDates", "Дати передсвяткових днів"], ["weekend", "Вихідні дні"],
                ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
            ];
        }

        const tableBody = rowConfigs.map(([key, label]) => {
            const row = [label];
            let total = 0;
            months.forEach(m => {
                const monthData = data[m] || {};
                let val = monthData[key];
                let displayVal;

                if (key === 'holiday' && monthData['holidayRawDates']) {
                    val = monthData['holidayRawDates'].length;
                }

                if ((key === 'holidayRawDates' || key === 'preholidayDates') && Array.isArray(val)) {
                    displayVal = val.map(dateStr => dateStr.slice(0, 5)).join(", ") || "-";
                } else if (Array.isArray(val)) {
                    displayVal = val.join(", ") || "-";
                } else {
                    const numericVal = parseFloat(val);
                    if (!isNaN(numericVal)) {
                        total += numericVal;
                    }
                    if (key === 'hours' && !isNaN(numericVal)) {
                        displayVal = formatHours(numericVal);
                    } else if (key !== 'hours' && numericVal === 0) {
                        displayVal = "-";
                    } else {
                        displayVal = val;
                    }
                }
                row.push(displayVal != null ? displayVal.toString() : "-");
            });

            if (selected === "0" || selected.startsWith("Q")) {
                if (new Set(['holidayRawDates', 'preholidayDates']).has(key)) {
                    row.push("-");
                } else {
                    let displayTotal;
                     if (key === 'hours') {
                        displayTotal = formatHours(total);
                    } else {
                        displayTotal = (total === 0) ? "-" : total;
                    }
                    row.push(isNaN(displayTotal) ? "0" : displayTotal.toString());
                }
            }
            return row;
        });

        const columnStyles = {};
        const numCols = tableHead.length;
        columnStyles[0] = { cellWidth: 32, fontStyle: 'bold' };
        for (let i = 1; i < numCols; i++) {
             columnStyles[i] = { cellWidth: 'auto' };
        }
        if (selected === "0" || selected.startsWith("Q")) {
            columnStyles[numCols - 1] = { cellWidth: 'auto', fontStyle: 'bold' };
        }

        doc.autoTable({
            head: [tableHead],
            body: tableBody,
            startY: 28,
            theme: 'grid',
            margin: { left: 10, right: 10, bottom: 18 },
            headStyles: {
                fillColor: pdfColors.headerFillColor,
                textColor: pdfColors.headerTextColor,
                lineColor: pdfColors.gridColor,
                lineWidth: 0.1,
                font: "CustomFont",
                fontStyle: 'bold',
                halign: 'center'
            },
            styles: {
                font: "CustomFont",
                fontSize: 10,
                cellPadding: 2,
                valign: 'middle',
                halign: 'center',
                textColor: pdfColors.textColor,
                lineColor: pdfColors.gridColor,
                fillColor: pdfColors.cellFillColor, // Ось виправлення
                lineWidth: 0.1
            },
            columnStyles: columnStyles,
            didParseCell: function (data) {
                if (data.column.index === 0) { // Виділяємо першу колонку
                    data.cell.styles.fillColor = [ // Робимо її трохи світлішою за фон клітинок
                        Math.min(255, pdfColors.cellFillColor[0] + 15),
                        Math.min(255, pdfColors.cellFillColor[1] + 15),
                        Math.min(255, pdfColors.cellFillColor[2] + 15)
                    ];
                }
            }
        });

        const rightMargin = 15;
        const bottomMargin = 10;
        const logoSize = 10;
        const padding = 3;
        const logoX = pageWidth - rightMargin - logoSize;
        const logoY = pageHeight - bottomMargin - logoSize;

        if (logoData) {
            doc.addImage(logoData, 'PNG', logoX, logoY, logoSize, logoSize);
        } else {
            doc.setFont("CustomFont", 'normal');
            doc.setDrawColor(...pdfColors.gridColor);
            doc.rect(logoX, logoY, logoSize, logoSize);
            doc.text('Лого', logoX + logoSize / 2, logoY + logoSize / 2 + 3, { align: 'center' });
        }

        doc.setTextColor(...pdfColors.textColor);
        const textBlockX = logoX - padding;
        doc.setFontSize(9);
        doc.text("Створено калькулятором від RTantrumR", textBlockX, logoY + 3, { align: 'right' });
        doc.setFontSize(8);
        doc.text(`Дата: ${new Date().toLocaleDateString('uk-UA')}`, textBlockX, logoY + 7, { align: 'right' });

        doc.setTextColor(...pdfColors.linkColor); // Ось виправлення
        doc.textWithLink('Калькулятор норми робочого часу', 15, pageHeight - 8, { url: 'https://rtantrumr.github.io/Calc_html/' });
        doc.setTextColor(...pdfColors.textColor);

        doc.save(`Norma_robochogo_chasu_${year}.pdf`);

    } catch (error) {
        console.error("Детальна помилка при генерації PDF:", error);
        alert("Виникла несподівана помилка...");
    } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = 'Завантажити у PDF';
    }
}

function unlockSecretTheme() {
    flyoutNavClickCount++;
    console.log(`Flyout nav clicks: ${flyoutNavClickCount}`);

    if (flyoutNavClickCount > 25 && !isSecretThemeUnlocked) {
        isSecretThemeUnlocked = true;
        const themeDropdown = document.getElementById('theme-dropdown');
        const secretOption = document.createElement('div');
        secretOption.className = 'theme-option';
        secretOption.dataset.value = 'psychedelic-rainbow';
        secretOption.textContent = '???';
        themeDropdown.appendChild(secretOption);
        alert('✨ Ви щось розблокували! ✨');
    }
}

async function loadDocuments() {
    const yearSelect = document.getElementById('year-select');
    const docsGrid = document.getElementById('docs-grid');

    if (!yearSelect || !docsGrid) return;

    try {
        const response = await fetch('documents.json');
        const docsByYear = await response.json();

        const availableYears = Object.keys(docsByYear).sort((a, b) => b - a);
        availableYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });

        const renderDocs = (selectedYear) => {
            docsGrid.innerHTML = '';
            const yearsToRender = (selectedYear === 'all') ? availableYears : [selectedYear];

            yearsToRender.forEach(year => {
                if (docsByYear[year]) {
                    const yearTitle = document.createElement('h2');
                    yearTitle.className = 'docs-year-title';
                    yearTitle.textContent = year;
                    docsGrid.appendChild(yearTitle);

                    const yearContainer = document.createElement('div');
                    yearContainer.className = 'features-grid docs-page-grid';

                    docsByYear[year].forEach(doc => {
                        const docLink = document.createElement('a');
                        docLink.href = doc.link;
                        docLink.target = '_blank';
                        docLink.className = 'feature-block';

                        const featurePreview = document.createElement('div');
                        featurePreview.className = 'feature-preview';
                        featurePreview.innerHTML = `
                            <div class="business-preview">
                                <div class="preview-docs">
                                    <div class="doc doc-2">
                                        <div class="line line-short"></div><div class="line line-long"></div><div class="line line-long"></div><div class="line line-medium"></div>
                                    </div>
                                </div>
                            </div>`;

                        const featureDesc = document.createElement('div');
                        featureDesc.className = 'feature-description';

                        const docTitle = document.createElement('h3');
                        docTitle.textContent = doc.title;

                        const docP = document.createElement('p');
                        docP.textContent = doc.description;

                        featureDesc.appendChild(docTitle);
                        featureDesc.appendChild(docP);

                        docLink.appendChild(featurePreview);
                        docLink.appendChild(featureDesc);
                        yearContainer.appendChild(docLink);
                    });
                    docsGrid.appendChild(yearContainer);
                }
            });
        };

        renderDocs('all');
        yearSelect.addEventListener('change', () => renderDocs(yearSelect.value));

    } catch (error) {
        console.error('Помилка завантаження документів:', error);
        docsGrid.innerHTML = '<p>Не вдалося завантажити список документів.</p>';
    }
}

function themeSwitcher() {
    const themeContainer = document.querySelector('.theme-switcher-container');
    const themeButton = document.getElementById('theme-button');
    if (!themeButton) return;

    const themeText = themeButton.querySelector('.theme-text');
    const themeDropdown = document.getElementById('theme-dropdown');
    let dummySpan;

    function setupDummySpan() {
        dummySpan = document.createElement('span');
        const btnStyles = getComputedStyle(themeButton);
        Object.assign(dummySpan.style, {
            fontFamily: btnStyles.fontFamily, fontSize: btnStyles.fontSize,
            fontWeight: btnStyles.fontWeight, letterSpacing: btnStyles.letterSpacing,
            padding: btnStyles.padding, border: btnStyles.border,
            visibility: 'hidden', position: 'absolute', left: '-9999px'
        });
        document.body.appendChild(dummySpan);
    }

    function applyTheme(themeValue, themeLabel) {
        themeButton.classList.add('animating');
        themeText.classList.remove('visible');

        dummySpan.textContent = themeLabel;
        const newWidth = dummySpan.offsetWidth;
        const widthThreshold = 110;

        themeDropdown.classList.toggle('align-right', newWidth < widthThreshold);

        setTimeout(() => {
            themeContainer.style.width = `${newWidth}px`;
            themeButton.style.width = `${newWidth}px`;

            document.documentElement.setAttribute('data-theme', themeValue);
            localStorage.setItem('theme', themeValue);
            themeText.textContent = themeLabel;

            const nyanCatContainer = document.getElementById('nyan-cat-container');
            if (nyanCatContainer) {
                nyanCatContainer.style.display = themeValue === 'psychedelic-rainbow' ? 'block' : 'none';
            }

            setTimeout(() => {
                themeText.classList.add('visible');
                themeButton.classList.remove('animating');
            }, 400);
        }, 200);
    }

    themeButton.addEventListener('click', () => {
        themeDropdown.classList.toggle('visible');
    });

    document.addEventListener('click', (e) => {
        if (!themeButton.contains(e.target) && !themeDropdown.contains(e.target)) {
            themeDropdown.classList.remove('visible');
        }
    });

    themeDropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('theme-option')) {
            const themeValue = e.target.dataset.value;
            const themeLabel = e.target.textContent;
            themeDropdown.classList.remove('visible');
            applyTheme(themeValue, themeLabel);
        }
    });

    setupDummySpan();
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedOption = document.querySelector(`.theme-option[data-value="${savedTheme}"]`);
    const initialLabel = savedOption ? savedOption.textContent : 'Світла';

    document.documentElement.setAttribute('data-theme', savedTheme);
    themeText.textContent = initialLabel;
    dummySpan.textContent = initialLabel;
    const initialWidth = dummySpan.offsetWidth;
    themeContainer.style.width = `${initialWidth}px`;
    themeButton.style.width = `${initialWidth}px`;
    themeDropdown.classList.toggle('align-right', initialWidth < 110);
    setTimeout(() => themeText.classList.add('visible'), 50);
}

window.addEventListener("DOMContentLoaded", async () => {

    const featuresGrid = document.querySelector('.features-grid');
    if (featuresGrid) {
        const rulesModal = document.getElementById('rules-modal');
        const featureBlocks = document.querySelectorAll('.feature-block');
        const agreeButton = document.getElementById('agree-button');

        const runEntryAnimation = () => {
            featureBlocks.forEach(block => { block.style.opacity = '0'; });
            featuresGrid.classList.add('is-animating');

            const animationMap = {
                1: 'animate-from-left', 2: 'animate-from-top', 3: 'animate-from-right',
                4: 'animate-from-left', 5: 'animate-from-bottom', 6: 'animate-from-right'
            };

            featureBlocks.forEach((block, index) => {
                const blockNumber = index + 1;
                if (animationMap[blockNumber]) {
                    setTimeout(() => { block.classList.add(animationMap[blockNumber]); }, 100);
                }
            });

            setTimeout(() => { featuresGrid.classList.remove('is-animating'); }, 2500);
        };

        const hasAgreed = localStorage.getItem('rulesAgreed');

        if (hasAgreed === 'true') {
            if (rulesModal) rulesModal.classList.remove('visible');
            runEntryAnimation();
        } else {
            if (rulesModal) rulesModal.classList.add('visible');
        }

        if (agreeButton) {
            agreeButton.addEventListener('click', () => {
                localStorage.setItem('rulesAgreed', 'true');
                if (rulesModal) rulesModal.classList.remove('visible');
                // Невелика затримка перед запуском анімації
                setTimeout(runEntryAnimation, 100);
            });
        }
    } else {
         // Якщо сітки немає, просто обробляємо модальне вікно (для інших сторінок)
        const rulesModal = document.getElementById('rules-modal');
        if (rulesModal) {
            const agreeButton = document.getElementById('agree-button');
            const hasAgreed = localStorage.getItem('rulesAgreed');

            if (!hasAgreed) {
                rulesModal.classList.add('visible');
            }

            if (agreeButton) {
                agreeButton.addEventListener('click', () => {
                    localStorage.setItem('rulesAgreed', 'true');
                    rulesModal.classList.remove('visible');
                });
            }
        }
    }

    const contactEmailLink = document.getElementById('contact-email');
    if (contactEmailLink) {
        contactEmailLink.addEventListener('click', () => {
            const email = contactEmailLink.href.replace('mailto:', '');
            const notification = document.getElementById('copy-notification');

            navigator.clipboard.writeText(email).then(() => {
                if (notification) {
                    notification.textContent = 'Скопійовано!';
                    notification.classList.add('visible');

                    setTimeout(() => {
                        notification.classList.remove('visible');
                    }, 2500);
                }
            }).catch(err => {
                console.error('Не вдалося скопіювати email: ', err);
            });
        });
    }

    themeSwitcher();

    const flyoutNav = document.querySelector('.flyout-nav');
    if (flyoutNav) {
        flyoutNav.addEventListener('click', unlockSecretTheme);
    }

    loadDocuments();

    const showBtn = document.getElementById("showBtn");
    if (showBtn) {
        const dayInputs = document.querySelectorAll(".day");
        const templateSelect = document.getElementById("template");
        const downloadPdfBtn = document.getElementById('downloadPdfBtn');
        const resultsBody = document.getElementById('results-body');

        try {
            await loadHolidays();
        } catch(e) {
            console.error("Не вдалося завантажити дані про свята:", e);
            alert("Помилка завантаження критичних даних.");
        }

        resultsBody.addEventListener('click', (event) => {
            if (event.target.classList.contains('row-selector-arrow')) {
                const row = event.target.closest('tr');
                if (row) {
                    row.classList.toggle('row-highlighted');
                }
            }
        });
        showBtn.addEventListener("click", showTableLayout);
        downloadPdfBtn.addEventListener("click", downloadPdf);
        templateSelect.addEventListener("change", () => applyTemplate(templateSelect, dayInputs));
        dayInputs.forEach(input => input.addEventListener('input', () => validateAllInputs(dayInputs)));

        validateAllInputs(dayInputs);
    }
});