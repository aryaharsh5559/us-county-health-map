// County Health Rankings Interactive Visualization
// Main JavaScript file using D3.js

// Global variables
let countyData = null;
let geoData = null;
let currentYear = 2024;  // 2024 data now available
let currentMetric = 'life_expectancy';  // Default to life expectancy
let currentState = 'all';
let svg = null;
let projection = null;
let path = null;
let colorScale = null;
let currentView = 'deviation';  // 'deviation' (beat the odds) or 'metric' (single metric)
let currentCategory = 'all';
let deviationByFips = new Map();
let modelInfo = null;

const signed = (d, digits = 1) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(digits)}`;

// Years of life above (+) or below (−) what income, insurance and access to care predict
const deviationConfig = {
    name: 'Years Above or Below Prediction',
    legendTitle: 'Actual minus predicted life expectancy (years)',
    legendTitleShort: 'Actual − predicted (years)',
    format: d => d == null ? 'N/A' : `${signed(d)} years`,
    // Colors are clamped at ±8, so label the ends as "8 or more"
    legendFormat: d => Math.abs(d) === 8 ? `${signed(d, 0)}+` : signed(d, 0),
    tickValues: [-8, -6, -4, -2, 0, 2, 4, 6, 8],
    domain: [-8, 8]
};

const CATEGORY_LABELS = {
    above: 'Living longer than predicted',
    expected: 'Close to prediction',
    below: 'Living shorter than predicted'
};

// Health behaviors compared with income peers in the county profile (lower is better for all)
const BEHAVIORS = [
    { key: 'adult_smoking', label: 'adult smoking' },
    { key: 'physical_inactivity', label: 'physical inactivity' },
    { key: 'adult_obesity', label: 'adult obesity' },
    { key: 'diabetes', label: 'diabetes' },
    { key: 'excessive_drinking', label: 'excessive drinking' },
    { key: 'poor_health', label: 'poor or fair health' }
];

// Metric configurations
const metrics = {
    life_expectancy: {
        name: 'Life Expectancy',
        unit: 'years',
        format: d => d ? d.toFixed(1) + ' years' : 'N/A',
        domain: [70, 85],  // High life expectancy = dark green (good/healthy)
        colorScheme: d3.interpolateGreens
    },
    premature_death: {
        name: 'Premature Death Rate',
        unit: 'years of life lost before 75, per 100,000',
        format: d => d ? Math.round(d).toLocaleString() + ' years lost per 100k' : 'N/A',
        legendFormat: d3.format(','),
        legendTitle: 'Premature Death (years of life lost before 75, per 100k)',
        legendTitleShort: 'Premature death (YLL per 100k)',
        domain: [5000, 15000],  // Wider range for better differentiation
        colorScheme: d3.interpolateReds  // High death = dark red (bad)
    },
    adult_obesity: {
        name: 'Adult Obesity',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [25, 40],  // Tightened range for better differentiation
        colorScheme: d3.interpolateOranges  // High obesity = dark orange (bad)
    },
    adult_smoking: {
        name: 'Adult Smoking',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [10, 30],
        colorScheme: d3.interpolateReds  // High smoking = dark red (bad)
    },
    physical_inactivity: {
        name: 'Physical Inactivity',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [15, 35],
        colorScheme: d3.interpolatePurples  // High inactivity = dark purple (bad)
    },
    diabetes: {
        name: 'Diabetes Prevalence',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [8, 16],  // Tightened range for better differentiation
        colorScheme: d3.interpolateOrRd  // High diabetes = dark red-orange (bad)
    },
    poor_health: {
        name: 'Poor or Fair Health',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [10, 30],
        colorScheme: d3.interpolateOranges  // High poor health = dark orange (bad)
    },
    excessive_drinking: {
        name: 'Excessive Drinking',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [10, 25],
        colorScheme: d3.interpolatePurples  // High drinking = dark purple (bad)
    },
    hs_graduation: {
        name: 'High School Graduation',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [70, 95],  // High graduation = dark green (well-educated)
        colorScheme: d3.interpolateGreens
    },
    median_income: {
        name: 'Median Household Income',
        unit: '$',
        format: d => d ? '$' + d.toLocaleString() : 'N/A',
        domain: [30000, 90000],  // High income = dark blue (affluent/good)
        colorScheme: d3.interpolateBlues
    },
    uninsured: {
        name: 'Uninsured Rate',
        unit: '%',
        format: d => d ? d.toFixed(1) + '%' : 'N/A',
        domain: [5, 25],
        colorScheme: d3.interpolateReds  // High uninsured = dark red (bad)
    },
    primary_care_rate: {
        name: 'Primary Care Physicians',
        unit: 'per 100,000 population',
        format: d => d ? d.toFixed(1) + ' per 100k residents' : 'N/A',
        domain: [20, 100],  // High doctors per capita = dark green (well-served)
        colorScheme: d3.interpolateGreens
    }
};

// Initialize the visualization
function init() {
    console.log('Initializing visualization...');
    
    // Set up event listeners
    setupEventListeners();
    
    // Load data
    loadData();
}

function setupEventListeners() {
    // Year slider
    d3.select('#year-slider').on('input', function() {
        currentYear = +this.value;
        d3.select('#year-display').text(currentYear);
        updateVisualization();
    });
    
    // Metric selector
    d3.select('#metric-selector').on('change', function() {
        currentMetric = this.value;
        updateVisualization();
    });
    
    // View toggle: beat-the-odds map or single metric
    d3.selectAll('.view-btn').on('click', function() {
        setView(this.dataset.view);
    });

    // Category filter (beat-the-odds view)
    d3.select('#category-filter').on('change', function() {
        currentCategory = this.value;
        updateVisualization();
    });

    // Reset button
    d3.select('#reset-button').on('click', function() {
        resetVisualization();
    });
}

function setView(view) {
    currentView = view;
    d3.selectAll('.view-btn')
        .classed('active', function() { return this.dataset.view === view; })
        .attr('aria-pressed', function() { return this.dataset.view === view; });
    d3.select('#category-group').style('display', view === 'deviation' ? null : 'none');
    d3.select('#metric-group').style('display', view === 'metric' ? null : 'none');
    updateVisualization();
}

async function loadData() {
    try {
        console.log('Loading data...');
        
        const [us, health, deviation, model] = await Promise.all([
            d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json'),
            loadCountyHealthData(),
            d3.csv('data/county_deviation.csv', d => ({
                fips: d.fips,
                life_expectancy: +d.life_expectancy,
                predicted_le: +d.predicted_le,
                deviation: +d.deviation,
                category: d.category,
                income_decile: +d.income_decile
            })),
            d3.json('data/deviation_model.json')
        ]);
        geoData = us;
        countyData = health;
        deviationByFips = new Map(deviation.map(d => [d.fips, d]));
        modelInfo = model;

        console.log('Data loaded successfully');

        initializeMap();
        renderModelSummary();
        renderRankings();
        updateVisualization();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Error loading data. Please check the console for details.');
    }
}

async function loadCountyHealthData() {
    // Errors propagate to the caller, which shows a message instead of the map
    const data = await d3.csv('data/county_health_data.csv', d => ({
        fips: d.fips,
        county: d.county,
        state: d.state,
        year: +d.year,
        // Health Outcomes
        life_expectancy: +d.life_expectancy || null,
        premature_death: +d.premature_death || null,
        poor_health: +d.poor_health || null,
        // Health Behaviors
        adult_obesity: +d.adult_obesity || null,
        adult_smoking: +d.adult_smoking || null,
        physical_inactivity: +d.physical_inactivity || null,
        diabetes: +d.diabetes || null,
        excessive_drinking: +d.excessive_drinking || null,
        // Socioeconomic
        median_income: +d.median_income || null,
        hs_graduation: +d.hs_graduation || null,
        // Clinical Care
        uninsured: +d.uninsured || null,
        primary_care_rate: +d.primary_care_rate || null
    }));
    return data;
}

function initializeMap() {
    // Set up SVG
    svg = d3.select('#map-svg');
    const width = svg.node().getBoundingClientRect().width;
    // Keep the map's aspect ratio on narrow screens instead of a fixed 600px tall box
    const height = Math.min(600, Math.round(width * 0.62));
    svg.style('height', `${height}px`);

    // Set up projection
    projection = d3.geoAlbersUsa()
        .scale(Math.min(width * 1.3, height * 2.1))
        .translate([width / 2, height / 2]);
    
    path = d3.geoPath().projection(projection);
    
    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', (event) => {
            svg.selectAll('g').attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // Create main group for counties
    svg.append('g').attr('class', 'counties');
    
    // Create group for state boundaries
    svg.append('g').attr('class', 'states');
}

function updateVisualization() {
    if (!geoData || !countyData) return;
    
    console.log(`Updating visualization: Year=${currentYear}, Metric=${currentMetric}, State=${currentState}`);
    
    // Filter data for current year
    const yearData = countyData.filter(d => d.year === currentYear);
    
    // Create lookup map
    const dataMap = new Map(yearData.map(d => [d.fips, d]));

    let metricConfig;
    if (currentView === 'deviation') {
        metricConfig = deviationConfig;
        // Diverging: brown = shorter lives than predicted, teal = longer
        colorScale = d3.scaleDiverging()
            .domain([metricConfig.domain[0], 0, metricConfig.domain[1]])
            .interpolator(d3.interpolateBrBG)
            .clamp(true);
    } else {
        metricConfig = metrics[currentMetric];
        // D3 sequential interpolators run light to dark, so high values are always darkest
        colorScale = d3.scaleSequential()
            .domain(metricConfig.domain)
            .interpolator(metricConfig.colorScheme);
    }

    updateCounties(dataMap, metricConfig);
    updateLegend(metricConfig);
}

// Value drawn on the map for a county in the current view
function mapValue(fips, dataMap) {
    if (currentView === 'deviation') {
        const dev = deviationByFips.get(fips);
        return dev ? dev.deviation : null;
    }
    const row = dataMap.get(fips);
    return row ? row[currentMetric] : null;
}

function isFilteredOut(fips) {
    if (currentView !== 'deviation' || currentCategory === 'all') return false;
    const dev = deviationByFips.get(fips);
    return !dev || dev.category !== currentCategory;
}

function updateCounties(dataMap, metricConfig) {
    const counties = topojson.feature(geoData, geoData.objects.counties).features;
    
    const countyElements = svg.select('.counties')
        .selectAll('path')
        .data(counties, d => d.id);
    
    // Enter + Update
    countyElements.enter()
        .append('path')
        .attr('fill', '#e9ecef')  // neutral start so the first transition doesn't fade in from black
        .merge(countyElements)
        .attr('class', 'county')
        .attr('d', path)
        .classed('filtered-out', d => isFilteredOut(d.id))
        .transition()
        .duration(500)
        .attr('fill', d => {
            const value = mapValue(d.id, dataMap);
            return value == null || Number.isNaN(value) ? '#ccc' : colorScale(value);
        });
    
    // Add event listeners
    svg.selectAll('.county')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .style('stroke', '#333')
                .style('stroke-width', '2px');
            
            showCountyInfo(d, dataMap);
        })
        .on('mouseout', function() {
            d3.select(this)
                .style('stroke', '#fff')
                .style('stroke-width', '0.5px');
        })
        .on('click', function(event, d) {
            // Highlight clicked county
            d3.select(this)
                .style('stroke', '#ff6b6b')
                .style('stroke-width', '3px');
            
            const countyData = dataMap.get(d.id);
            if (countyData) {
                showCountyModal(d.id, countyData.county, countyData.state);
            }
        });
    
    // Update state boundaries
    const states = topojson.mesh(geoData, geoData.objects.states, (a, b) => a !== b);
    
    svg.select('.states')
        .selectAll('path')
        .data([states])
        .join('path')
        .attr('class', 'state-boundary')
        .attr('d', path);
}

// Horizontal bar of actual life expectancy with a marker at the predicted value
function predictionBarHtml(dev) {
    const lo = 50, hi = 95;  // covers every county (lowest is about 54 years)
    const pct = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    const cls = dev.category === 'above' ? 'bar-above' : dev.category === 'below' ? 'bar-below' : 'bar-expected';
    return `
        <div class="prediction-bar" role="img"
             aria-label="Actual ${dev.life_expectancy.toFixed(1)} years, predicted ${dev.predicted_le.toFixed(1)} years">
            <div class="prediction-fill ${cls}" style="width: ${pct(dev.life_expectancy)}%"></div>
            <div class="prediction-marker" style="left: ${pct(dev.predicted_le)}%"></div>
        </div>
        <div class="prediction-scale"><span>${lo}</span><span>Bar: actual · Line: predicted</span><span>${hi} yrs</span></div>`;
}

function showCountyInfo(countyGeo, dataMap) {
    const countyData = dataMap.get(countyGeo.id);
    const metricConfig = metrics[currentMetric];

    let html = '<p><em>No data available</em></p>';

    if (countyData && currentView === 'deviation') {
        const dev = deviationByFips.get(countyGeo.id);
        html = `<p><strong>${countyData.county}, ${countyData.state}</strong></p>`;
        if (dev) {
            html += `
                <p><span class="category-pill pill-${dev.category}">${CATEGORY_LABELS[dev.category]}</span></p>
                <p><strong>Actual:</strong> ${dev.life_expectancy.toFixed(1)} years<br>
                   <strong>Predicted:</strong> ${dev.predicted_le.toFixed(1)} years<br>
                   <strong>Difference:</strong> ${deviationConfig.format(dev.deviation)}</p>
                ${predictionBarHtml(dev)}
                <p><strong>Median income:</strong> ${metrics.median_income.format(countyData.median_income)}</p>`;
        } else {
            html += '<p><em>No life expectancy estimate for this county.</em></p>';
        }
    } else if (countyData) {
        html = `
            <p><strong>${countyData.county}, ${countyData.state}</strong></p>
            <p><strong>${metricConfig.name}:</strong> ${metricConfig.format(countyData[currentMetric])}</p>
            <p><strong>Year:</strong> ${currentYear}</p>
        `;
        
        // Show additional metrics
        if (countyData.life_expectancy && currentMetric !== 'life_expectancy') {
            html += `<p><strong>Life Expectancy:</strong> ${metrics.life_expectancy.format(countyData.life_expectancy)}</p>`;
        }
        if (countyData.median_income && currentMetric !== 'median_income') {
            html += `<p><strong>Median Income:</strong> ${metrics.median_income.format(countyData.median_income)}</p>`;
        }
    }
    
    d3.select('#county-info').html(html);
}

function updateLegend(metricConfig) {
    const legendSvg = d3.select('#legend-svg');
    legendSvg.selectAll('*').remove();
    
    const width = legendSvg.node().getBoundingClientRect().width;
    const narrow = width < 500;
    const side = narrow ? 16 : 100;
    const margin = { top: 30, right: side, bottom: 30, left: side };
    
    const legendWidth = width - margin.left - margin.right;
    const legendHeight = 20;
    
    const g = legendSvg.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Create gradient
    const defs = legendSvg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'legend-gradient');
    
    const numStops = 10;
    for (let i = 0; i <= numStops; i++) {
        const t = i / numStops;
        const value = metricConfig.domain[0] + t * (metricConfig.domain[1] - metricConfig.domain[0]);
        gradient.append('stop')
            .attr('offset', `${t * 100}%`)
            .attr('stop-color', colorScale(value));
    }
    
    // Draw legend rectangle
    g.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#legend-gradient)');
    
    // Add scale
    const legendScale = d3.scaleLinear()
        .domain(metricConfig.domain)
        .range([0, legendWidth]);
    
    const legendAxis = d3.axisBottom(legendScale)
        .tickFormat(d => (metricConfig.legendFormat || metricConfig.format)(d));
    if (metricConfig.tickValues) {
        // Every other tick on narrow screens so labels don't collide
        legendAxis.tickValues(narrow ? metricConfig.tickValues.filter((_, i) => i % 2 === 0) : metricConfig.tickValues);
    } else {
        legendAxis.ticks(narrow ? 3 : 5);
    }
    
    g.append('g')
        .attr('transform', `translate(0, ${legendHeight})`)
        .call(legendAxis);
    
    // Add title
    g.append('text')
        .attr('x', legendWidth / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-weight', 'bold')
        .style('font-size', narrow ? '12px' : null)
        .text(narrow ? (metricConfig.legendTitleShort || metricConfig.name) : (metricConfig.legendTitle || metricConfig.name));
}

function renderModelSummary() {
    if (!modelInfo) return;
    const m = modelInfo;
    d3.select('#model-summary').html(`
        <div class="stat"><span class="stat-value">${m.above.toLocaleString()}</span><span class="stat-label">counties living 2+ years longer than predicted</span></div>
        <div class="stat"><span class="stat-value">${m.expected.toLocaleString()}</span><span class="stat-label">within 2 years of prediction</span></div>
        <div class="stat"><span class="stat-value">${m.below.toLocaleString()}</span><span class="stat-label">living 2+ years shorter than predicted</span></div>
        <div class="stat"><span class="stat-value">±${m.mae_years.toFixed(1)}</span><span class="stat-label">years: typical prediction error (R² = ${m.out_of_fold_r2.toFixed(2)})</span></div>`);
    d3.select('#model-footnote').html(
        `Model accuracy on held-out counties: R² = ${m.out_of_fold_r2.toFixed(2)}, mean absolute error ${m.mae_years.toFixed(1)} years, ` +
        `across ${m.counties.toLocaleString()} counties with a ${m.year} life expectancy estimate. ` +
        `Income alone explains R² = ${m.compared['Linear regression, income only'].r2.toFixed(2)}.`);
}

function renderRankings() {
    const names = new Map(countyData.filter(d => d.year === currentYear).map(d => [d.fips, d]));
    const ranked = [...deviationByFips.values()].filter(d => names.has(d.fips));
    const fill = (selector, rows) => {
        const items = d3.select(selector).selectAll('li')
            .data(rows)
            .join('li')
            .attr('tabindex', 0)
            .attr('role', 'button')
            .html(d => {
                const c = names.get(d.fips);
                return `<span class="rank-name">${c.county}, ${c.state}</span>
                        <span class="rank-value ${d.deviation > 0 ? 'pos' : 'neg'}">${signed(d.deviation)} yrs</span>
                        <span class="rank-detail">${d.life_expectancy.toFixed(1)} actual vs ${d.predicted_le.toFixed(1)} predicted</span>`;
            });
        const open = d => { const c = names.get(d.fips); showCountyModal(d.fips, c.county, c.state); };
        items.on('click', (event, d) => open(d))
             .on('keydown', (event, d) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(d); } });
    };
    fill('#list-above', d3.sort(ranked, d => -d.deviation).slice(0, 10));
    fill('#list-below', d3.sort(ranked, d => d.deviation).slice(0, 10));
}

function resetVisualization() {
    currentYear = 2024;
    currentMetric = 'life_expectancy';
    currentState = 'all';
    currentCategory = 'all';

    d3.select('#year-slider').property('value', currentYear);
    d3.select('#year-display').text(currentYear);
    d3.select('#metric-selector').property('value', currentMetric);
    d3.select('#category-filter').property('value', currentCategory);
    setView('deviation');
    
    // Reset zoom
    svg.transition().duration(750).call(
        d3.zoom().transform,
        d3.zoomIdentity
    );
    
    updateVisualization();
}

function showError(message) {
    d3.select('#map-container').append('div')
        .attr('class', 'error-message')
        .style('color', 'red')
        .style('padding', '20px')
        .style('text-align', 'center')
        .text(message);
}

// ========================================
// COUNTY DETAIL MODAL FUNCTIONALITY
// ========================================

let selectedCountyFips = null;
let modalYear = 2024;

function showCountyModal(fips, countyName, stateName) {
    selectedCountyFips = fips;
    modalYear = 2024; // Reset to latest year
    
    // Update modal header
    d3.select('#modal-county-name').text(countyName);
    d3.select('#modal-county-state').text(stateName);
    
    // Reset year slider
    d3.select('#modal-year-slider').property('value', modalYear);
    d3.select('#modal-year-display').text(modalYear);
    
    updateModalDeviation();
    updateModalMetrics();

    // Show modal
    d3.select('#county-modal').style('display', 'block');
}

function hideCountyModal() {
    d3.select('#county-modal').style('display', 'none');
    
    // Remove highlight from all counties
    svg.selectAll('.county')
        .style('stroke', '#fff')
        .style('stroke-width', '0.5px');
    
    selectedCountyFips = null;
}

// Prediction vs actual, plus health behaviors compared with counties in the same income decile
function updateModalDeviation() {
    const container = d3.select('#modal-deviation');
    const dev = deviationByFips.get(selectedCountyFips);
    const county = countyData.find(d => d.fips === selectedCountyFips && d.year === 2024);
    if (!dev || !county || !modelInfo) {
        container.html('<p class="muted">No life expectancy estimate for this county, so it has no prediction.</p>');
        return;
    }

    const peers = modelInfo.peer_medians_by_income_decile[String(dev.income_decile)];
    const rows = BEHAVIORS
        .filter(b => county[b.key] != null && peers[b.key] != null)
        .map(b => ({ ...b, value: county[b.key], peer: peers[b.key], diff: county[b.key] - peers[b.key] }));

    // Behaviors that line up with the direction of the gap (lower is better for all of them)
    const helping = rows.filter(r => r.diff <= -1).sort((a, b) => a.diff - b.diff);
    const hurting = rows.filter(r => r.diff >= 1).sort((a, b) => b.diff - a.diff);
    const list = rs => rs.slice(0, 2).map(r => `${r.diff < 0 ? 'lower' : 'higher'} ${r.label} (${signed(r.diff)} pts)`).join(' and ');

    let story;
    if (dev.category === 'above') {
        story = helping.length
            ? `Compared with counties at a similar income level, it has ${list(helping)}.`
            : 'Its health behaviors look similar to counties at the same income level, so the gap likely reflects factors not in this data.';
    } else if (dev.category === 'below') {
        story = hurting.length
            ? `Compared with counties at a similar income level, it has ${list(hurting)}.`
            : 'Its health behaviors look similar to counties at the same income level, so the gap likely reflects factors not in this data.';
    } else {
        story = 'Its life expectancy is within two years of what its income and access to care predict.';
    }

    container.html(`
        <div class="deviation-card pill-border-${dev.category}">
            <p><span class="category-pill pill-${dev.category}">${CATEGORY_LABELS[dev.category]}</span></p>
            <p class="deviation-headline">
                Lives <strong>${dev.life_expectancy.toFixed(1)}</strong> years on average, versus
                <strong>${dev.predicted_le.toFixed(1)}</strong> predicted
                (<strong>${deviationConfig.format(dev.deviation)}</strong>).
            </p>
            ${predictionBarHtml(dev)}
            <p class="deviation-story">${story}</p>
            <table class="peer-table">
                <thead><tr><th>Health behavior</th><th>This county</th><th>Similar-income counties</th></tr></thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>${r.label[0].toUpperCase() + r.label.slice(1)}</td>
                            <td class="${r.diff <= -1 ? 'better' : r.diff >= 1 ? 'worse' : ''}">${r.value.toFixed(1)}%</td>
                            <td>${r.peer.toFixed(1)}%</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            <p class="muted">Similar-income counties: income decile ${dev.income_decile} of 10 (median values). Differences are correlations, not causes.</p>
        </div>`);
}

function updateModalMetrics() {
    if (!selectedCountyFips || !countyData) return;
    
    // Find data for the selected county and year
    const countyYearData = countyData.find(d => 
        d.fips === selectedCountyFips && d.year === modalYear
    );
    
    if (!countyYearData) {
        d3.select('#modal-metrics-container').html('<p style="color: #999; text-align: center;">No data available for this year</p>');
        return;
    }
    
    // Build metrics display
    const metricsToShow = [
        { key: 'life_expectancy', label: 'Life Expectancy', icon: '💚' },
        { key: 'premature_death', label: 'Premature Death Rate', icon: '💔' },
        { key: 'adult_obesity', label: 'Adult Obesity', icon: '🍔' },
        { key: 'adult_smoking', label: 'Adult Smoking', icon: '🚬' },
        { key: 'physical_inactivity', label: 'Physical Inactivity', icon: '🛋️' },
        { key: 'diabetes', label: 'Diabetes', icon: '🩺' },
        { key: 'excessive_drinking', label: 'Excessive Drinking', icon: '🍺' },
        { key: 'poor_health', label: 'Poor Health', icon: '🤒' },
        { key: 'median_income', label: 'Median Household Income', icon: '💰' },
        { key: 'hs_graduation', label: 'High School Graduation', icon: '🎓' },
        { key: 'primary_care_rate', label: 'Primary Care Physicians', icon: '👨‍⚕️' },
        { key: 'uninsured', label: 'Uninsured', icon: '🏥' }
    ];
    
    const container = d3.select('#modal-metrics-container');
    container.html('');
    
    metricsToShow.forEach(metric => {
        const value = countyYearData[metric.key];
        const metricConfig = metrics[metric.key];
        
        if (!metricConfig) return;
        
        const row = container.append('div').attr('class', 'metric-row');
        
        row.append('div')
            .attr('class', 'metric-name')
            .html(`${metric.icon} ${metric.label}`);
        
        row.append('div')
            .attr('class', value != null ? 'metric-value' : 'metric-value na')
            .text(value != null ? metricConfig.format(value) : 'N/A');
    });
}

// Set up modal event listeners
function setupModalListeners() {
    // Close button
    d3.select('.modal-close').on('click', hideCountyModal);
    
    // Click outside modal to close
    d3.select('#county-modal').on('click', function(event) {
        if (event.target.id === 'county-modal') {
            hideCountyModal();
        }
    });
    
    // Year slider
    d3.select('#modal-year-slider').on('input', function() {
        modalYear = +this.value;
        d3.select('#modal-year-display').text(modalYear);
        updateModalMetrics();
    });
    
    // Escape key to close
    d3.select('body').on('keydown', function(event) {
        if (event.key === 'Escape') {
            hideCountyModal();
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupModalListeners();
    });
} else {
    init();
    setupModalListeners();
}

