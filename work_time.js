/* --- Завантаження та зберігання даних --- */
let holidaysData = {};

export async function loadHolidays() {
    const res = await fetch("./data/holidays.json");
    holidaysData = await res.json();
}

/* --- Допоміжні функції для роботи з датами --- */
function parseDate(str) {
    const [d, m, y] = str.split(".").map(Number);
    return new Date(y, m - 1, d);
}

function dateToString(date) {
    return date.toDateString();
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/* --- Функції для розрахунку святкових та скорочених днів --- */
function getOriginalHolidays(year) {
    return (holidaysData[year] || []).map(h => ({
        original: parseDate(h.date),
        name: h.name
    }));
}

function getAdjustedHolidays(year, dailyHours) {
    const original = getOriginalHolidays(year);
    const adjusted = new Map();

    for (let { original: date } of original) {
        let adjustedDate = new Date(date);
        let idx = (date.getDay() + 6) % 7;
        if (dailyHours[idx] === 0) {
            let offset = 1;
            while (true) {
                const candidate = new Date(date);
                candidate.setDate(candidate.getDate() + offset);
                if (candidate.getFullYear() !== year) break;
                const dow = (candidate.getDay() + 6) % 7;
                if (dailyHours[dow] > 0 && !adjusted.has(dateToString(candidate))) {
                    adjustedDate = candidate;
                    break;
                }
                offset++;
            }
        }
        adjusted.set(dateToString(adjustedDate), { adjusted: adjustedDate, original: date });
    }
    return adjusted;
}

function getShortenedDays(year, rawHolidays, dailyHours) {
    const set = new Set();
    for (let date of rawHolidays) {
        const prev = new Date(date);
        prev.setDate(prev.getDate() - 1);
        const dow = (prev.getDay() + 6) % 7;
        if (prev.getFullYear() === year && dailyHours[dow] > 0) {
            set.add(dateToString(prev));
        }
        if (date.getMonth() === 0 && date.getDate() === 1 && date.getFullYear() === year + 1) {
            const dec31 = new Date(year, 11, 31);
            const dow31 = (dec31.getDay() + 6) % 7;
            if (dailyHours[dow31] > 0) {
                set.add(dateToString(dec31));
            }
        }
    }
    return set;
}

/* --- Основна функція для розрахунку норми робочого часу --- */
export function calculateSummary(year, selected, dailyHours, ignoreHolidays = false) {
    const monthMap = {};
    for (let i = 0; i < 12; i++) monthMap[i] = i + 1;
    const nextYearRawHolidays = getOriginalHolidays(year + 1).map(h => h.original);
    const months = [];
    if (selected === "0") months.push(...Array.from({ length: 12 }, (_, i) => i + 1));
    else if (selected.startsWith("Q")) months.push(...Array.from({ length: 3 }, (_, i) => (parseInt(selected[1]) - 1) * 3 + i + 1));
    else months.push(parseInt(selected));

    const rawHolidayObjs = getOriginalHolidays(year);
    const rawHolidaysByMonth = {};
    for (const h of rawHolidayObjs) {
        const m = h.original.getMonth();
        if (!rawHolidaysByMonth[m]) rawHolidaysByMonth[m] = [];
        rawHolidaysByMonth[m].push(h.original);
    }
    const rawHolidays = rawHolidayObjs.map(h => h.original);
    const adjustedMap = ignoreHolidays ? new Map() : getAdjustedHolidays(year, dailyHours);
    const adjustedHolidays = new Set([...adjustedMap.values()].map(v => dateToString(v.adjusted)));
    const allRawHolidays = rawHolidays.concat(nextYearRawHolidays);
    const shortenedSet = (!ignoreHolidays && (dailyHours.filter(h => h >= 8).length >= 2 || dailyHours.reduce((a, b) => a + b, 0) >= 40))
        ? getShortenedDays(year, allRawHolidays, dailyHours)
        : new Set();

    const dateOptions = { day: '2-digit', month: '2-digit', year: '2-digit' };

    const result = {};
    for (let m of months) {
        const days = getDaysInMonth(year, m);
        const summary = {
            calendar: days,
            holiday: 0,
            holidayRawDates: [],
            weekend: 0,
            nonWorking: 0,
            working: 0,
            preholiday: 0,
            preholidayDates: [],
            hours: 0
        };

        for (let d = 1; d <= days; d++) {
            const date = new Date(year, m - 1, d);
            const iso = dateToString(date);
            const dow = (date.getDay() + 6) % 7;
            const h0 = dailyHours[dow];
            let h = h0;

            const isRawHoliday = (rawHolidaysByMonth[m - 1] || []).some(h => h.getTime() === date.getTime());
            const isHoliday = adjustedHolidays.has(iso);
            const isShortened = shortenedSet.has(iso);
            const isWeekend = h0 === 0;

            if (isRawHoliday) summary.holidayRawDates.push(date.toLocaleDateString("uk-UA", dateOptions));
            if (isHoliday) summary.holiday++;
            if (isWeekend) summary.weekend++;
            if (isHoliday || isWeekend) summary.nonWorking++;
            else summary.working++;

            if (!isHoliday && isShortened && h > 1) {
                h -= 1;
                summary.preholiday++;
                summary.preholidayDates.push(date.toLocaleDateString("uk-UA", dateOptions));
            }

            if (!isHoliday) summary.hours += h;
        }
        result[m] = summary;
    }
    return result;
}