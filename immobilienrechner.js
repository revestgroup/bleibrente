'use strict';

// Destatis GENESIS 12621-0001, Germany 2023/25, annual p(x).
// Rows correspond to attained ages 60 through 100, columns to male and female.
const yearlySurvival = [
  [0.99114679,0.9952021],
  [0.9901664,0.9946486],
  [0.98899001,0.9940749],
  [0.98778765,0.99339943],
  [0.98637894,0.9925504],
  [0.98504881,0.99192309],
  [0.98370982,0.99096268],
  [0.98212193,0.99021148],
  [0.98062592,0.98929091],
  [0.97876762,0.98827332],
  [0.97723355,0.98714133],
  [0.97503273,0.98588425],
  [0.97334221,0.98433714],
  [0.97091776,0.98296516],
  [0.96832977,0.98133224],
  [0.96567454,0.97921966],
  [0.96173006,0.97637799],
  [0.95912871,0.9739335],
  [0.9548839,0.9706812],
  [0.95000318,0.96738883],
  [0.94371444,0.96278416],
  [0.9377676,0.95825119],
  [0.93219732,0.95361033],
  [0.92370483,0.94758552],
  [0.91514388,0.94021511],
  [0.9034694,0.93069808],
  [0.89137442,0.92009064],
  [0.87728626,0.90727058],
  [0.85874127,0.89181278],
  [0.83886077,0.87674388],
  [0.81823061,0.85781325],
  [0.79824043,0.83894717],
  [0.77304778,0.81660561],
  [0.74843473,0.7947056],
  [0.72584245,0.77039378],
  [0.699237,0.74551747],
  [0.67692547,0.72388026],
  [0.65493782,0.69623993],
  [0.62635438,0.67057783],
  [0.60425075,0.65088798],
  [0.58167159,0.63116949],
];
const scenarios = [0.03, 0.05];
// Die Werte nach PLZ-Präfix dienen als grobe Näherung, wenn Ortsdaten fehlen.
const regionPrices = {
  haus: [2200, 3400, 3300, 2700, 3000, 3200, 3100, 4000, 5400, 3300],
  wohnung: [2400, 4200, 3800, 2900, 3300, 3500, 3500, 4500, 7200, 3700]
};
const postcodeMultipliers = {
  '10': 1.3, '14': 1.15, '20': 1.35, '22': 1.25, '40': 1.2, '50': 1.2,
  '60': 1.3, '61': 1.15, '70': 1.25, '80': 1.5, '81': 1.4, '82': 1.35,
  '83': 1.15, '85': 1.05
};
const localPriceReferences = {
  '89616': {
    place: 'Rottenacker',
    prices: { haus: 2350, wohnung: 2436 },
    source: 'immowelt, September 2026',
    url: 'https://www.immowelt.de/immobilienpreise/baden-wurttemberg/rottenacker-89616/ad08de6208'
  }
};
const defaultRentalYield = 0.04;
// Gerundete gemeinsame Beispielwerte pro 100.000 Euro Prämie aus den zwei alten Modellreihen.
const exampleAnnuityRates = [350, 383, 425, 483, 558, 650];
const firstAge = 60;
const lastAge = firstAge + yearlySurvival.length - 1;
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const byId = (id) => document.getElementById(id);

function readAmount(input) {
  const value = input.value.trim().replace(/[\s\u00a0\u202f]/g, '');
  let normalized;
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) {
    normalized = value.replaceAll('.', '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(value)) {
    normalized = value;
  } else {
    return null;
  }
  const amount = Number(normalized);
  return amount > 0 && amount <= 100_000_000 ? amount : null;
}

function effectiveAge(input) {
  const value = input.value.trim();
  return /^\d{1,3}$/.test(value) ? Number(value) : null;
}

function setError(input, errorId, message) {
  const error = byId(errorId);
  error.textContent = message;
  error.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function barwertFactor(people, end, rate) {
  const survival = people.map(() => 1);
  const probabilityOfRight = () => {
    const [one, two] = survival;
    if (people.length === 1) return one;
    return end === 'first' ? one * two : one + two - one * two;
  };
  let factor = 0;
  let start = 1;
  for (let year = 0; start > 1e-10; year++) {
    people.forEach(({ age, column }, index) => {
      const row = Math.min(age + year, lastAge) - firstAge;
      survival[index] *= yearlySurvival[row][column];
    });
    const finish = probabilityOfRight();
    // Approximate each year's occupancy by averaging start and end probabilities.
    factor += ((start + finish) / 2) / (1 + rate) ** (year + 0.5);
    start = finish;
  }
  return factor;
}

function deductionRange(people, end, yearlyRent) {
  const tables = { male: [0], female: [1], unknown: [0, 1] };
  const variants = people.reduce((combinations, person) => combinations.flatMap((combination) =>
    tables[person.table || 'unknown'].map((column) => [...combination, { age: person.age, column }])), [[]]);
  const deductions = variants.flatMap((variant) =>
    scenarios.map((rate) => yearlyRent * barwertFactor(variant, end, rate)));
  return [Math.min(...deductions), Math.max(...deductions)];
}

function estimateProperty(type, postalCode, area, year) {
  const age = new Date().getFullYear() - year;
  const factors = [[5, 1.15], [15, 1.05], [30, .95], [50, .85], [Infinity, .78]];
  const [, ageFactor] = factors.find(([threshold]) => age < threshold);
  const regionalPrice = regionPrices[type][Number(postalCode[0])];
  const prefixMultiplier = postcodeMultipliers[postalCode.slice(0, 2)] || 1;
  const pricePerSquareMetre = localPriceReferences[postalCode]?.prices[type] ?? regionalPrice * prefixMultiplier;
  return Math.round(pricePerSquareMetre * ageFactor * area);
}

function annuityRate(age) {
  if (!Number.isFinite(age) || age < 60 || age > 85) return null;
  const position = (age - 60) / 5;
  const index = Math.floor(position);
  const weight = position - index;
  const lower = exampleAnnuityRates[index];
  const upper = exampleAnnuityRates[index + 1] ?? lower;
  return lower + weight * (upper - lower);
}

function formatRange([lower, upper], rounding = 1000) {
  const roundedLower = Math.round(lower / rounding) * rounding;
  const roundedUpper = Math.round(upper / rounding) * rounding;
  if (roundedUpper === 0 && upper > 0) return 'unter ' + euro.format(rounding);
  if (roundedLower === roundedUpper) return euro.format(roundedUpper);
  return euro.format(roundedLower) + ' bis ' + euro.format(roundedUpper);
}

const propertyForm = byId('property-form');
const peopleForm = byId('people-form');
const postalInput = byId('postal-code');
const areaInput = byId('floor-area');
const yearInput = byId('build-year');
const marketInput = byId('market-value');
const rentInput = byId('monthly-rent');
const ageInputs = [byId('age-one'), byId('age-two')];
const tableInputs = [byId('table-one'), byId('table-two')];
const endInput = byId('right-end');
const slider = byId('annuity-share');
const annuityPerson = byId('annuity-person');
let prices = [0, 0];
let resultAges = [];

const calculatorSteps = [...document.querySelectorAll('[data-step]')];

function showStep(step) {
  for (const section of calculatorSteps) {
    section.hidden = Number(section.dataset.step) !== step;
    if (!section.hidden) {
      byId('progress-label').textContent = 'Schritt ' + step + ' von ' + calculatorSteps.length;
      section.querySelector('.step-heading').focus({ preventScroll: true });
    }
  }
  document.querySelectorAll('.progress-track span').forEach((part, index) => {
    part.classList.toggle('filled', index < step);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderPropertyEstimate(values) {
  byId('property-price').textContent = formatRange([values.market, values.market]);
  const source = byId('property-price-source');
  source.hidden = !values.localReference;
  if (values.localReference) {
    source.href = values.localReference.url;
    source.textContent = values.localReference.source;
  }
  byId('property-price-note').textContent = values.ownMarket
    ? 'Wir rechnen mit Ihrem eingegebenen Marktwert.'
    : values.localReference
      ? `${values.localReference.place}: ${euro.format(values.localReference.prices[values.type])} je m² als Basis. Das Baujahr fließt in die Schätzung ein.`
      : 'Grobe regionale Näherung anhand des PLZ-Präfixes, der Wohnfläche und des Baujahrs. Für diese PLZ sind keine eigenen Ortsdaten hinterlegt.';
}

function syncPeople() {
  const isPair = peopleForm.elements.occupants.value === 'pair';
  byId('person-two').hidden = !isPair;
  byId('person-two').disabled = !isPair;
  byId('first-legend').hidden = !isPair;
}

function propertyValues(validate = false) {
  const type = propertyForm.elements['property-type'].value;
  const postalCode = postalInput.value.trim();
  const area = readAmount(areaInput);
  const yearText = yearInput.value.trim();
  const year = Number(yearText);
  const ownMarket = readAmount(marketInput);
  const ownRent = readAmount(rentInput);
  const checks = [
    [postalInput, 'postal-error', /^\d{5}$/.test(postalCode) && postalCode !== '00000', 'Bitte geben Sie eine fünfstellige Postleitzahl ein.'],
    [areaInput, 'area-error', area > 0 && area <= 10000, 'Bitte geben Sie eine Wohnfläche in Quadratmetern ein.'],
    [yearInput, 'build-year-error', /^\d{4}$/.test(yearText) && year >= 1000 && year <= new Date().getFullYear(), 'Bitte geben Sie ein gültiges Baujahr ein.'],
    [marketInput, 'value-error', !marketInput.value.trim() || ownMarket, 'Bitte geben Sie einen gültigen Marktwert in Euro ein.'],
    [rentInput, 'rent-error', !rentInput.value.trim() || ownRent, 'Bitte geben Sie eine gültige monatliche Kaltmiete ein.']
  ];
  if (validate) checks.forEach(([input, id, valid, message]) => setError(input, id, valid ? '' : message));
  if (checks.some(([, , valid]) => !valid)) return null;

  const market = ownMarket || estimateProperty(type, postalCode, area, year);
  const yearlyRent = ownRent ? ownRent * 12 : market * defaultRentalYield;
  const localReference = ownMarket ? null : localPriceReferences[postalCode];
  return { type, postalCode, area, year, market, yearlyRent, ownMarket, ownRent, localReference };
}

function focusInvalidProperty() {
  const invalid = propertyForm.querySelector('[aria-invalid="true"]');
  if (invalid?.closest('details')) invalid.closest('details').open = true;
  invalid?.focus();
}

function syncSplit() {
  const percent = Number(slider.value);
  const portion = percent / 100;
  byId('split-share').textContent = percent + ' %';
  slider.setAttribute('aria-valuetext', percent + ' Prozent für die Sofortrente');
  byId('split-upfront').textContent = formatRange(prices.map((price) => price * (1 - portion)));
  const premium = prices.map((price) => price * portion);
  byId('split-premium').textContent = formatRange(premium);
  const rate = annuityRate(resultAges[Number(annuityPerson.value)]);
  byId('annuity-example').hidden = rate === null;
  byId('annuity-note').textContent = rate === null
    ? 'Für dieses Alter enthält das Modell keinen Rentenfaktor. Die Monatsrente ergibt sich aus dem Versicherungsangebot.'
    : 'Die Monatsrente ist eine Modellrechnung mit Beispielwerten aus dem bisherigen Rechner. Die tatsächliche Rente ergibt sich aus dem Versicherungsangebot.';
  if (rate !== null) {
    byId('monthly-example').textContent = formatRange(premium.map((amount) => amount / 100000 * rate), 10);
  }
}

propertyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = propertyValues(true);
  if (!values) {
    focusInvalidProperty();
    return;
  }
  renderPropertyEstimate(values);
  showStep(2);
});

peopleForm.addEventListener('change', (event) => {
  if (event.target.name === 'occupants') syncPeople();
  if (event.target === endInput) setError(endInput, 'right-end-error', '');
});

peopleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const isPair = peopleForm.elements.occupants.value === 'pair';
  const ages = ageInputs.slice(0, isPair ? 2 : 1).map(effectiveAge);
  const firstInvalid = ages.findIndex((age) => age === null || age < firstAge || age > lastAge);

  ages.forEach((age, index) => {
    const errorId = index === 0 ? 'age-one-error' : 'age-two-error';
    let message = '';
    if (age === null) message = 'Bitte geben Sie das Alter in vollen Jahren ein.';
    else if (age < firstAge || age > lastAge) message = 'Die Online-Schätzung reicht von 60 bis 100 Jahren.';
    setError(ageInputs[index], errorId, message);
  });
  const needsEnd = isPair && !endInput.value;
  setError(endInput, 'right-end-error', needsEnd ? 'Bitte wählen Sie aus, wann das Recht enden soll.' : '');
  if (firstInvalid >= 0 || needsEnd) {
    (ageInputs[firstInvalid] || endInput).focus();
    return;
  }

  const values = propertyValues(true);
  if (!values) {
    showStep(1);
    focusInvalidProperty();
    return;
  }
  const { market, yearlyRent } = values;
  const people = ages.map((age, index) => ({ age, table: tableInputs[index].value }));
  const deductions = deductionRange(people, isPair ? endInput.value : '', yearlyRent);
  prices = [Math.max(0, market - deductions[1]), Math.max(0, market - deductions[0])];
  const [low, high] = prices;
  resultAges = ages;
  byId('annuity-person-field').hidden = !isPair;
  if (!isPair) annuityPerson.value = '0';
  byId('price-range').textContent = high ? formatRange(prices) : 'Persönliche Prüfung sinnvoll';
  byId('result-copy').textContent = low
    ? 'Erste Orientierung vor Verkaufskosten und Ablösung offener Darlehen. Den erzielbaren Preis klären wir anhand der Bewertung vor Ort und der Käuferangebote.'
    : 'In mindestens einem Szenario erreicht oder übersteigt der Abschlag den angegebenen Marktwert. Lassen Sie Markt- und Mietwert persönlich prüfen.';
  byId('result-market').textContent = euro.format(market);
  byId('result-rent').textContent = euro.format(yearlyRent);
  byId('result-deduction').textContent = formatRange(deductions);
  const marketBasis = values.ownMarket
    ? 'Für den Immobilienwert verwenden wir Ihre Angabe.'
    : values.localReference
      ? `Der Immobilienwert basiert auf ${euro.format(values.localReference.prices[values.type])} je m² in ${values.localReference.place} (${values.localReference.source}), gewichtet nach Baujahr.`
      : 'Der Immobilienwert basiert auf einer groben regionalen Näherung nach PLZ-Präfix.';
  const rentBasis = values.ownRent ? 'Wir rechnen mit Ihrer angegebenen Kaltmiete.' : 'Als Jahreskaltmiete setzen wir beispielhaft 4 % des Immobilienwerts an.';
  byId('result-assumptions').textContent = marketBasis + ' ' + rentBasis;
  byId('split').hidden = low === 0;
  syncSplit();
  showStep(4);
});

for (const [input, errorId] of [[postalInput, 'postal-error'], [areaInput, 'area-error'], [yearInput, 'build-year-error'], [marketInput, 'value-error'], [rentInput, 'rent-error'], [ageInputs[0], 'age-one-error'], [ageInputs[1], 'age-two-error']]) {
  input.addEventListener('input', () => setError(input, errorId, ''));
}

for (const button of document.querySelectorAll('[data-go]')) {
  button.addEventListener('click', () => showStep(Number(button.dataset.go)));
}
slider.addEventListener('input', syncSplit);
annuityPerson.addEventListener('change', syncSplit);

byId('preview-confirmation').addEventListener('click', () => {
  window.location.replace(document.documentElement.classList.contains('embedded') ? 'danke.html?fenster=1' : 'danke.html');
});

syncPeople();
document.querySelector('.progress-track span').classList.add('filled');
byId('calculator-content').hidden = false;
