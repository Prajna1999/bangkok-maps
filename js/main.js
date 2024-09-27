// Initialize the map
const map = L.map('map').setView([13.736717, 100.523186], 11);

// Add the base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Global variables to store layers and data
let subDistrictsLayer, clusterLayer;
let subDistrictsData, riskPointsData;

// Function to load GeoJSON data
async function loadGeoJSON(url) {
    const response = await fetch(url);
    return response.json();
}

// Color scale for subdistricts
function getColor(count) {
    return count > 20 ? '#d73027' :
        count > 15 ? '#fc8d59' :
            count > 10 ? '#fee08b' :
                count > 5 ? '#d9ef8b' :
                    '#91cf60';
}

// Style function for subdistricts
function subDistrictStyle(feature) {
    return {
        fillColor: getColor(feature.properties.riskPointCount || 0),
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

function riskPointStyle(feature) {
    return {
        radius: 8,
        fillColor: getStatusColor(feature.properties.status_detail),
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    };
}

function getStatusColor(status) {
    switch (status) {
        case 'แก้ไขแล้วเสร็จบางส่วน': return '#ffa500';
        case 'อยู่ระหว่างดำเนินการแก้ไข': return '#ffff00';
        default: return '#ff0000';
    }
}

// Popup functions
function subDistrictPopup(feature, layer) {
    if (feature.properties) {
        layer.bindPopup(`
            <strong>${feature.properties.subdistrict_t}</strong><br>
            District: ${feature.properties.district_t}<br>
            Province: ${feature.properties.province_t}<br>
            Area: ${feature.properties.area_bma} sq km<br>
            Risk Points: ${feature.properties.riskPointCount || 0}
        `);
    }
}

// function riskPointPopup(feature, layer) {
//     if (feature.properties) {
//         layer.bindPopup(`
//             <strong>${feature.properties.roadcl_name}</strong><br>
//             Problem: ${feature.properties.problems}<br>
//             District: ${feature.properties.district}<br>
//             Status: ${feature.properties.status_detail}<br>
//             Project: ${feature.properties.project_name}
//         `);
//     }
// }

// Load and process data
async function loadData() {
    try {
        console.log('Starting to load GeoJSON data...');

        const subDistrictsResponse = await fetch('data/geojson/subdistricts_bma.geojson');
        const riskPointsResponse = await fetch('data/geojson/risk_point_one.geojson');

        console.log('Subdistricts response status:', subDistrictsResponse.status);
        console.log('Risk points response status:', riskPointsResponse.status);

        subDistrictsData = await subDistrictsResponse.json();
        riskPointsData = await riskPointsResponse.json();

        console.log('Subdistricts data:', subDistrictsData);
        console.log('Risk points data:', riskPointsData);

        if (!subDistrictsData || !riskPointsData) {
            throw new Error('Failed to load one or both GeoJSON files');
        }

        console.log('Data loaded successfully. Processing data...');
        processData();
        console.log('Initializing layers...');
        initializeLayers();
        initializeFilters();
        initializeLayerControls();
        updateDataInsights(riskPointsData.features);
        map.fitBounds(subDistrictsLayer.getBounds());
    } catch (error) {
        console.error('Error loading or processing data:', error);
    }
}

// Process data
function processData() {
    // Count risk points per subdistrict
    const riskPointCounts = {};
    riskPointsData.features.forEach(point => {
        const subdistrict = point.properties.district;
        riskPointCounts[subdistrict] = (riskPointCounts[subdistrict] || 0) + 1;
    });

    // Add risk point count to subdistrict properties
    subDistrictsData.features.forEach(subdistrict => {
        subdistrict.properties.riskPointCount = riskPointCounts[subdistrict.properties.subdistrict_t] || 0;
    });
}

// Initialize layers
function initializeLayers() {
    if (subDistrictsData && subDistrictsData.features) {
        subDistrictsLayer = L.geoJSON(subDistrictsData, {
            style: subDistrictStyle,
            onEachFeature: onEachFeature
        }).addTo(map);
    }

    clusterLayer = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: false,
        showCoverageOnHover: true,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 15
    });

    if (riskPointsData && riskPointsData.features) {
        riskPointsData.features.forEach((feature) => {
            if (feature.geometry && feature.geometry.coordinates) {
                const lat = feature.geometry.coordinates[1];
                const lon = feature.geometry.coordinates[0];
                if (typeof lat === 'number' && typeof lon === 'number') {
                    const marker = L.circleMarker([lat, lon], riskPointStyle(feature));
                    const popupContent = riskPointPopup(feature);
                    if (popupContent) {
                        marker.bindPopup(popupContent);
                    }
                    clusterLayer.addLayer(marker);
                }
            }
        });
    }

    map.addLayer(clusterLayer);
}

function riskPointPopup(feature) {
    if (feature && feature.properties) {
        return `
            <strong>${feature.properties.roadcl_name || 'N/A'}</strong><br>
            Problem: ${feature.properties.problems || 'N/A'}<br>
            District: ${feature.properties.district || 'N/A'}<br>
            Status: ${feature.properties.status_detail || 'N/A'}<br>
            Project: ${feature.properties.project_name || 'N/A'}
        `;
    }
    return null;
}
// Initialize filters
function initializeFilters() {
    const statusFilter = document.getElementById('status-filter');
    const districtFilter = document.getElementById('district-filter');

    if (riskPointsData && riskPointsData.features) {
        // Populate status filter
        const statuses = [...new Set(riskPointsData.features.map(f => f.properties.status_detail))];
        populateFilter(statusFilter, statuses);

        // Populate district filter
        const districts = [...new Set(riskPointsData.features.map(f => f.properties.district))];
        populateFilter(districtFilter, districts);

        // Add event listeners
        statusFilter.addEventListener('change', applyFilters);
        districtFilter.addEventListener('change', applyFilters);
    } else {
        console.error('Risk points data not loaded yet');
    }
}

function populateFilter(selectElement, options) {
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        selectElement.appendChild(optionElement);
    });
}

// Apply filters
function applyFilters() {
    const statusFilter = document.getElementById('status-filter').value;
    const districtFilter = document.getElementById('district-filter').value;

    const filteredData = riskPointsData.features.filter(feature => {
        const statusMatch = !statusFilter || feature.properties.status_detail === statusFilter;
        const districtMatch = !districtFilter || feature.properties.district === districtFilter;
        return statusMatch && districtMatch;
    });

    clusterLayer.clearLayers();
    filteredData.forEach(feature => {
        const marker = L.circleMarker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], riskPointStyle(feature));
        marker.bindPopup(riskPointPopup(feature));
        clusterLayer.addLayer(marker);
    });

    updateDataInsights(filteredData);
    updateChart(filteredData);
}

// Update data insights
function updateDataInsights(data) {
    if (!data) {
        console.error('No data available for insights');
        return;
    }

    const totalPoints = data.length;
    const statusCounts = countByProperty(data, 'status_detail');
    const districtCounts = countByProperty(data, 'district');

    // Update total points
    document.getElementById('total-points').innerHTML = `<strong>Total Risk Points:</strong> ${totalPoints}`;

    // Update status breakdown
    updateBreakdown('status-breakdown', 'Status Breakdown', statusCounts, totalPoints);

    // Update top districts
    updateTopList('top-districts', 'Top 5 Districts', districtCounts, totalPoints, 5);

    // Animate the data insights update
    animateDataInsights();
}

function countByProperty(data, property) {
    return data.reduce((acc, feature) => {
        const value = feature.properties[property];
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function updateBreakdown(elementId, title, counts, total) {
    let html = `<strong>${title}:</strong><ul>`;
    for (const [item, count] of Object.entries(counts)) {
        const percentage = ((count / total) * 100).toFixed(2);
        html += `<li>${item}: ${count} (${percentage}%)</li>`;
    }
    html += '</ul>';
    document.getElementById(elementId).innerHTML = html;
}

function updateTopList(elementId, title, counts, total, limit) {
    let html = `<strong>${title}:</strong><ul>`;
    Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .forEach(([item, count]) => {
            const percentage = ((count / total) * 100).toFixed(2);
            html += `<li>${item}: ${count} (${percentage}%)</li>`;
        });
    html += '</ul>';
    document.getElementById(elementId).innerHTML = html;
}

// Initialize layer controls
function initializeLayerControls() {
    const subdistrictsToggle = document.getElementById('subdistricts-toggle');
    const riskPointsToggle = document.getElementById('risk-points-toggle');

    subdistrictsToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(subDistrictsLayer);
        } else {
            map.removeLayer(subDistrictsLayer);
        }
    });

    riskPointsToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(clusterLayer);
        } else {
            map.removeLayer(clusterLayer);
        }
    });
}

// Add custom control for toggling sidebar
L.Control.DataInsights = L.Control.extend({
    onAdd: function (map) {
        const container = L.DomUtil.create('div');
        // container.innerHTML = '<strong>Toggle Sidebar</strong>';
        container.style.cursor = 'pointer';

        container.onclick = function () {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('hidden');
            if (sidebar.classList.contains('hidden')) {
                map.getContainer().style.width = '100%';
            } else {
                map.getContainer().style.width = '75%';
            }
            map.invalidateSize();
        }

        return container;
    }
});

new L.Control.DataInsights({ position: 'topright' }).addTo(map);

// Add legend
function addLegend() {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        const grades = [0, 5, 10, 15, 20];
        const labels = [];

        div.innerHTML = '<h4>Risk Points</h4>';

        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }

        return div;
    };

    legend.addTo(map);
}

// Animate data insights update
function animateDataInsights() {
    const dataInsights = document.getElementById('data-insights');
    dataInsights.style.opacity = '0';
    dataInsights.style.transform = 'translateY(20px)';
    dataInsights.style.transition = 'opacity 0.5s, transform 0.5s';

    setTimeout(() => {
        dataInsights.style.opacity = '1';
        dataInsights.style.transform = 'translateY(0)';
    }, 100);
}

// Add hover effect to subdistricts
function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7
    });
    layer.bringToFront();
    updateInfoBox(layer.feature.properties);
}

function resetHighlight(e) {
    subDistrictsLayer.resetStyle(e.target);
    updateInfoBox();
}

function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
}

// Add info box
const info = L.control();

info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info');
    this.update();
    return this._div;
};

info.update = function (props) {
    this._div.innerHTML = '<h4>Bangkok Subdistrict Info</h4>' + (props ?
        '<b>' + props.subdistrict_t + '</b><br />' + props.riskPointCount + ' risk points'
        : 'Hover over a subdistrict');
};

info.addTo(map);

function updateInfoBox(props) {
    info.update(props);
}

// Add chart for data visualization
let statusChart;

function addChart() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    const statusCounts = countByProperty(riskPointsData.features, 'status_detail');

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56']
            }]
        },
        options: {
            responsive: true,
            legend: {
                position: 'bottom',
            },
            title: {
                display: true,
                text: 'Risk Points by Status'
            }
        }
    });
}

function updateChart(data) {
    const statusCounts = countByProperty(data, 'status_detail');
    statusChart.data.labels = Object.keys(statusCounts);
    statusChart.data.datasets[0].data = Object.values(statusCounts);
    statusChart.update();
}

// Initialize the application
async function init() {
    await loadData();
    addLegend();
    addChart();
}

// PDF download function
function downloadMapAndInsights() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    // Capture the map with all layers
    map.once('rendercomplete', function () {
        html2canvas(document.getElementById('map'), {
            useCORS: true,
            scale: 2
        }).then(canvas => {
            const mapImgData = canvas.toDataURL('image/png');
            pdf.addImage(mapImgData, 'PNG', 10, 10, 190, 100);

            // Capture insights and charts
            captureInsightsAndCharts(pdf);
        });
    });
    map.fire('rendercomplete');
}

function captureInsightsAndCharts(pdf) {
    const sidebar = document.getElementById('sidebar');
    const insightsContent = sidebar.cloneNode(true);

    // Replace chart canvas with base64 image
    const chartCanvas = insightsContent.querySelector('#statusChart');
    if (chartCanvas) {
        const chartImg = document.createElement('img');
        chartImg.src = statusChart.toBase64Image(); // Assuming 'statusChart' is your Chart.js instance
        chartCanvas.parentNode.replaceChild(chartImg, chartCanvas);
    }

    // Capture text content
    const textContent = insightsContent.innerText;

    // Add text content to PDF
    pdf.setFontSize(10);
    pdf.text(textContent, 10, 120, { maxWidth: 190 });

    // Add chart image to PDF
    if (chartCanvas) {
        pdf.addImage(statusChart.toBase64Image(), 'PNG', 10, 200, 190, 80);
    }

    pdf.save('bangkok-risk-points-map-and-insights.pdf');
}


// Improved sidebar toggle function
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mapContainer = document.getElementById('map-container');
    const isHidden = sidebar.classList.contains('hidden');

    if (isHidden) {
        sidebar.classList.remove('hidden');
        sidebar.style.transform = 'translateX(0)';
        mapContainer.style.width = '75%';
    } else {
        sidebar.style.transform = 'translateX(100%)';
        mapContainer.style.width = '100%';
        // Wait for transition to finish before adding 'hidden' class
        setTimeout(() => {
            sidebar.classList.add('hidden');
        }, 300); // Match this with your CSS transition time
    }

    // Trigger a resize event to update the map
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        map.invalidateSize();
    }, 400); // Slightly longer than the transition time
}

// Add event listeners
document.getElementById('download-pdf').addEventListener('click', downloadMapAndInsights);

// Create and add the sidebar toggle control
L.Control.SidebarToggle = L.Control.extend({
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '<strong>Toggle Sidebar</strong>';
        container.style.cursor = 'pointer';
        container.onclick = toggleSidebar;
        return container;
    }
});

new L.Control.SidebarToggle({ position: 'topright' }).addTo(map);

// Add event listener to the download button
document.getElementById('download-pdf').addEventListener('click', downloadMapAndInsights);
// Run the initialization
init();