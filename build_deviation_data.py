"""
Build the "beat the odds" dataset: how much longer (or shorter) each county lives
than its socioeconomic conditions predict.

The model sees only socioeconomic and access-to-care measures (median income,
uninsured rate, primary care physicians). Health behaviors are left out on purpose:
they are part of *how* a county ends up above or below its prediction, so the site
uses them to explain a county's deviation rather than to predict it.

Every prediction is out-of-fold (5-fold cross-validation), so no county is scored
by a model that was trained on it.

Output: data/county_deviation.csv and data/deviation_model.json
"""

import json

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
YEAR = 2024
# Deviation (actual − predicted, in years) beyond which a county is labeled above or below expectation
THRESHOLD_YEARS = 2.0
BEHAVIORS = ['adult_smoking', 'adult_obesity', 'physical_inactivity',
             'diabetes', 'excessive_drinking', 'poor_health']

df = pd.read_csv('data/county_health_data.csv', dtype={'fips': str})
df = df[(df['year'] == YEAR) & df['life_expectancy'].notna() & df['median_income'].notna()].copy()

# Features: income on a log scale (each doubling matters about equally), plus access to care
X = pd.DataFrame({
    'log_income': np.log(df['median_income']),
    'uninsured': df['uninsured'],
    'log_primary_care': np.log1p(df['primary_care_rate']),
}, index=df.index)
X = X.fillna(X.median())
y = df['life_expectancy']

cv = KFold(n_splits=5, shuffle=True, random_state=SEED)
candidates = {
    'Linear regression, income only': (make_pipeline(StandardScaler(), LinearRegression()), ['log_income']),
    'Linear regression, 3 socioeconomic features': (make_pipeline(StandardScaler(), LinearRegression()), list(X.columns)),
    'Gradient boosting, 3 socioeconomic features': (HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05,
                                                                                  max_iter=300, random_state=SEED),
                                                    list(X.columns)),
}

results = {}
for name, (model, cols) in candidates.items():
    pred = cross_val_predict(model, X[cols], y, cv=cv)
    results[name] = {'pred': pred, 'r2': r2_score(y, pred), 'mae': mean_absolute_error(y, pred)}
    print(f'{name:48s}  out-of-fold R² = {results[name]["r2"]:.3f}   MAE = {results[name]["mae"]:.2f} years')

best_name = max(results, key=lambda n: results[n]['r2'])
best = results[best_name]
print(f'\nUsing: {best_name}')

df['predicted_le'] = best['pred']
df['deviation'] = df['life_expectancy'] - df['predicted_le']
df['category'] = np.select(
    [df['deviation'] >= THRESHOLD_YEARS, df['deviation'] <= -THRESHOLD_YEARS],
    ['above', 'below'], default='expected')

# Income peers: counties in the same national income decile. Each county's health behaviors
# are compared with its peers' medians to suggest why it beats or misses its prediction.
df['income_decile'] = pd.qcut(df['median_income'], 10, labels=False) + 1
peer_medians = df.groupby('income_decile')[BEHAVIORS].median().round(1)

out = df[['fips', 'life_expectancy', 'predicted_le', 'deviation', 'category', 'income_decile']].copy()
for c in ['life_expectancy', 'predicted_le', 'deviation']:
    out[c] = out[c].round(2)
out.to_csv('data/county_deviation.csv', index=False)

counts = df['category'].value_counts().to_dict()
summary = {
    'year': YEAR,
    'model': best_name,
    'features': ['median household income (log)', 'uninsured rate', 'primary care physicians per 100k (log)'],
    'out_of_fold_r2': round(best['r2'], 3),
    'mae_years': round(best['mae'], 2),
    'threshold_years': THRESHOLD_YEARS,
    'counties': int(len(df)),
    'above': int(counts.get('above', 0)),
    'expected': int(counts.get('expected', 0)),
    'below': int(counts.get('below', 0)),
    'peer_medians_by_income_decile': {str(k): v for k, v in peer_medians.to_dict(orient='index').items()},
    'compared': {n: {'r2': round(r['r2'], 3), 'mae': round(r['mae'], 2)} for n, r in results.items()},
}
with open('data/deviation_model.json', 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2)

print(json.dumps({k: v for k, v in summary.items() if k != 'compared'}, indent=2))
print('\nLargest positive deviations:')
print(df.nlargest(5, 'deviation')[['county', 'state', 'life_expectancy', 'predicted_le', 'deviation']].round(1).to_string(index=False))
print('\nLargest negative deviations:')
print(df.nsmallest(5, 'deviation')[['county', 'state', 'life_expectancy', 'predicted_le', 'deviation']].round(1).to_string(index=False))
