// Initialize the map
const map = L.map('map').setView([13.736717, 100.523186], 11);

// Add the base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Global variables to store layers and data
let subDistrictsLayer, riskPointsLayer;
let subDistrictsData, riskPointsData;

// Function to load GeoJSON data
function loadGeoJSON(url) {
    return fetch(url)
        .then(response => response.json());
}

// Style functions
function subDistrictStyle(feature) {
    return {
        fillColor: '#3388ff',
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
            Area: ${feature.properties.area_bma} sq km
        `);
    }
}

function riskPointPopup(feature, layer) {
    if (feature.properties) {
        layer.bindPopup(`
            <strong>${feature.properties.roadcl_name}</strong><br>
            Problem: ${feature.properties.problems}<br>
            District: ${feature.properties.district}<br>
            Status: ${feature.properties.status_detail}<br>
            Project: ${feature.properties.project_name}
        `);
    }
}

// Load and process data
Promise.all([
    loadGeoJSON('data/geojson/subdistricts_bma.geojson'),
    loadGeoJSON('data/geojson/risk_point_one.geojson')
]).then(([subDistricts, riskPoints]) => {
    subDistrictsData = subDistricts;
    riskPointsData = riskPoints;

    // Process and display subdistricts layer
    subDistrictsLayer = L.geoJSON(subDistrictsData, {
        style: subDistrictStyle,
        onEachFeature: subDistrictPopup
    }).addTo(map);

    // Process and display risk points layer with clustering
    const markers = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        animateAddingMarkers: true
    });

    riskPointsLayer = L.geoJSON(riskPointsData, {
        pointToLayer: (feature, latlng) => {
            const marker = L.circleMarker(latlng, riskPointStyle(feature));
            marker.bindPopup(riskPointPopup(feature));
            return marker;
        }
    });

    markers.addLayer(riskPointsLayer);
    map.addLayer(markers);

    // Initialize filters
    initializeFilters();

    // Initialize layer controls
    initializeLayerControls();

    // Update data insights
    updateDataInsights(riskPointsData.features);

    // Fit map to subdistricts bounds
    map.fitBounds(subDistrictsLayer.getBounds());
}).catch(error => {
    console.error('Error loading data:', error);
});

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

    map.eachLayer(layer => {
        if (layer instanceof L.MarkerClusterGroup) {
            map.removeLayer(layer);
        }
    });

    const markers = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        animateAddingMarkers: true
    });

    L.geoJSON(filteredData, {
        pointToLayer: (feature, latlng) => {
            const marker = L.circleMarker(latlng, riskPointStyle(feature));
            marker.bindPopup(riskPointPopup(feature));
            return marker;
        }
    }).addTo(markers);

    map.addLayer(markers);
    updateDataInsights(filteredData);
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
            applyFilters(); // This will re-add the clustered risk points
        } else {
            map.eachLayer(layer => {
                if (layer instanceof L.MarkerClusterGroup) {
                    map.removeLayer(layer);
                }
            });
        }
    });
}

// Add custom control for toggling sidebar
L.Control.DataInsights = L.Control.extend({
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '<strong>Toggle Sidebar</strong>';
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