# Data Guide

## Data Sources

### Primary Dataset
**County Health Rankings & Roadmaps** - 2025 Release (v3)
- Website: https://www.countyhealthrankings.org/health-data
- File: `2025 County Health Rankings Data - v3.xlsx`

### Time Series Dataset
**CDC PLACES** (Local Data for Better Health)
- Website: https://www.cdc.gov/places/
- Files: County-level data releases (2020-2024)

## Data Processing

The visualization uses pre-processed data in `data/county_health_data.csv`.

### To Regenerate Data

If you need to regenerate the data from source files:

1. Place source data files in the `data/` folder:
   - `2025 County Health Rankings Data - v3.xlsx`
   - CDC PLACES county data CSV files

2. Run the data processing scripts:
```bash
# Process CHR 2024 baseline
python convert_excel_correct.py

# Integrate PLACES time series data
python integrate_places_timeseries.py
```

## Data Coverage

- **Counties**: 3,159 U.S. counties
- **Map year**: 2024 (County Health Rankings 2025 release)
- **Metrics on the map**: 12 health and socioeconomic indicators

### 2018–2022 (CDC PLACES)
- Behavior measures: adult obesity, smoking, diabetes, physical inactivity, excessive drinking and poor or fair health
- Each year is taken from the PLACES release that contains it (2020 release → 2018 data, and so on)

### 2023–2024 (County Health Rankings)
- All metrics, from the 2025 County Health Rankings release (2024 values)
- `integrate_places_timeseries.py` writes the same 2024 values under both 2023 and 2024, so 2023 is not independent data. The site only displays 2024.
- The unemployment column is empty for every county and is not shown.

## License

Data is publicly available from County Health Rankings & Roadmaps and CDC PLACES.
