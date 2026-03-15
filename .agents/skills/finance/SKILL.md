---
name: finance-csv
description: Financial CSV processing and analysis for AI agents. Use when the user needs to process financial data, analyze CSV files, extract budgets, calculate totals, generate reports, or transform financial data. Triggers include requests to "process this CSV", "analyze financial data", "extract budget information", "calculate totals from CSV", "generate financial report", or any task requiring CSV data manipulation.
allowed-tools: Bash(csvq:*), Bash(jq:*), Bash(csvkit:*), Read, Write, Edit, Glob, Grep
---

# Financial CSV Processing Skill

## Overview

This skill enables AI agents to process, analyze, and transform financial CSV data using command-line tools. It covers common financial operations like budget extraction, total calculation, data filtering, and report generation.

## Core Tools

### 1. csvq - SQL-like CSV Querying
```bash
# Basic query
csvq "SELECT * FROM transactions.csv WHERE amount > 100"

# Aggregate functions
csvq "SELECT category, SUM(amount) as total FROM transactions.csv GROUP BY category"

# Date filtering
csvq "SELECT * FROM expenses.csv WHERE date >= '2024-01-01' AND date <= '2024-12-31'"

# Join multiple CSV files
csvq "SELECT t.*, c.category_name FROM transactions.csv t JOIN categories.csv c ON t.category_id = c.id"
```

### 2. csvkit - CSV Processing Suite
```bash
# View CSV structure
csvstat transactions.csv

# Convert CSV to JSON
csvjson transactions.csv > transactions.json

# Filter columns
csvcut -c date,amount,category transactions.csv

# Search within CSV
csvgrep -c category -m "Food" expenses.csv

# Sort data
csvsort -c date -r transactions.csv  # reverse chronological

# Merge CSV files
csvstack file1.csv file2.csv > combined.csv
```

### 3. jq - JSON Processing (for CSV->JSON conversions)
```bash
# Convert CSV to JSON and process
csvjson transactions.csv | jq '.[] | select(.amount > 100)'

# Aggregate with jq
csvjson expenses.csv | jq 'group_by(.category) | map({category: .[0].category, total: map(.amount | tonumber) | add})'
```

## Common Financial Workflows

### Budget Analysis
```bash
# Extract monthly spending by category
csvq "SELECT strftime('%Y-%m', date) as month, category, SUM(amount) as total FROM expenses.csv GROUP BY month, category ORDER BY month, total DESC"

# Compare budget vs actual
csvq "SELECT b.category, b.budgeted, COALESCE(SUM(e.amount), 0) as actual, (b.budgeted - COALESCE(SUM(e.amount), 0)) as variance FROM budget.csv b LEFT JOIN expenses.csv e ON b.category = e.category AND strftime('%Y-%m', e.date) = '2024-03' GROUP BY b.category"
```

### Transaction Categorization
```bash
# Categorize uncategorized transactions
csvq "UPDATE transactions.csv SET category = CASE WHEN description LIKE '%AMAZON%' THEN 'Shopping' WHEN description LIKE '%STARBUCKS%' THEN 'Food & Drink' ELSE 'Uncategorized' END WHERE category = ''"

# Export categorized data
csvq "SELECT * FROM transactions.csv WHERE category != 'Uncategorized'" > categorized.csv
```

### Financial Report Generation
```bash
# Generate monthly summary
csvq "SELECT 
  strftime('%Y-%m', date) as month,
  COUNT(*) as transactions,
  SUM(amount) as total_spent,
  AVG(amount) as avg_transaction,
  MIN(amount) as min_spent,
  MAX(amount) as max_spent
FROM transactions.csv 
GROUP BY month 
ORDER BY month DESC" > monthly_summary.csv

# Create category breakdown
csvq "SELECT 
  category,
  COUNT(*) as count,
  SUM(amount) as total,
  ROUND(SUM(amount) * 100.0 / (SELECT SUM(amount) FROM transactions.csv), 2) as percentage
FROM transactions.csv 
GROUP BY category 
ORDER BY total DESC" > category_breakdown.csv
```

## Data Cleaning & Preparation

### Fix Common CSV Issues
```bash
# Remove empty rows
csvgrep -c amount -r '.' transactions.csv > cleaned.csv

# Standardize date format
csvq "SELECT date(date) as date, amount, category FROM transactions.csv" > standardized.csv

# Handle missing values
csvq "SELECT COALESCE(category, 'Uncategorized') as category, amount FROM transactions.csv"

# Convert string amounts to numbers
csvq "SELECT amount * 1.0 as amount_numeric FROM transactions.csv"
```

### Data Validation
```bash
# Check for duplicates
csvq "SELECT *, COUNT(*) as dup_count FROM transactions.csv GROUP BY date, amount, description HAVING COUNT(*) > 1"

# Validate date ranges
csvq "SELECT MIN(date) as earliest, MAX(date) as latest FROM transactions.csv"

# Check for outliers (3 standard deviations)
csvq "SELECT * FROM transactions.csv WHERE amount > (SELECT AVG(amount) + 3 * STDDEV(amount) FROM transactions.csv)"
```

## Integration with Other Skills

### Combine with Browser Automation
```bash
# Download CSV from web and process
agent-browser open https://bank.example.com/export
agent-browser click @export_button
agent-browser wait --download transactions.csv
csvq "SELECT * FROM transactions.csv WHERE amount > 0" > deposits.csv
```

### Combine with Shell Operations
```bash
# Process multiple CSV files
for file in *.csv; do
  csvstat "$file" | head -5
done

# Batch processing
find . -name "*.csv" -exec csvgrep -c category -m "Food" {} \; > all_food_expenses.csv
```

## Best Practices

1. **Always backup original data** before processing
2. **Use transactions.csv** as standard filename for financial data
3. **Validate data** before analysis (check dates, amounts, categories)
4. **Document transformations** in comments or log files
5. **Handle currency formatting** consistently (remove $ symbols, commas)
6. **Use appropriate precision** for financial calculations (2 decimal places)

## Example: Complete Budget Analysis Pipeline

```bash
# 1. Clean and prepare data
csvgrep -c amount -r '.' raw_transactions.csv > transactions.csv
csvq "UPDATE transactions.csv SET category = TRIM(category)" transactions.csv

# 2. Categorize uncategorized transactions
csvq "UPDATE transactions.csv SET category = 'Dining' WHERE description LIKE '%RESTAURANT%' OR description LIKE '%CAFE%'" transactions.csv

# 3. Generate monthly report
csvq "SELECT 
  strftime('%Y-%m', date) as month,
  category,
  COUNT(*) as count,
  SUM(amount) as total,
  ROUND(AVG(amount), 2) as average
FROM transactions.csv 
WHERE date >= '2024-01-01'
GROUP BY month, category
ORDER BY month DESC, total DESC" > monthly_analysis.csv

# 4. Create summary visualization data
csvq "SELECT category, SUM(amount) as total FROM transactions.csv GROUP BY category ORDER BY total DESC LIMIT 10" > top_categories.csv
```

## Troubleshooting

**Common Issues:**
- CSV with BOM: Use `dos2unix` or `iconv` to remove BOM
- Mixed delimiters: Use `csvformat -T` for tab-delimited or specify delimiter
- Encoding issues: Convert with `iconv -f ISO-8859-1 -t UTF-8`
- Large files: Use `csvgrep` with `-m` for pattern matching instead of loading entire file

**Tool Installation:**
```bash
# Install required tools
pip install csvkit
# or
brew install csvkit
# csvq is available at https://github.com/mithrandie/csvq
```

This skill enables comprehensive financial data analysis while maintaining data integrity and producing actionable insights.