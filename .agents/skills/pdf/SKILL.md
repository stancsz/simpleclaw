---
name: pdf
description: PDF processing and analysis for AI agents. Use when the user needs to extract text from PDFs, analyze documents, convert PDFs to other formats, merge/split PDFs, or perform document research. Triggers include requests to "extract text from PDF", "analyze this document", "convert PDF to text", "merge PDF files", "split PDF pages", or any task requiring PDF manipulation.
allowed-tools: Bash(pdftotext:*), Bash(pdfinfo:*), Bash(qpdf:*), Bash(pdftk:*), Bash(ocrmypdf:*), Read, Write, Edit, Glob, Grep
---

# PDF Processing Skill

## Overview

This skill enables AI agents to process, analyze, and manipulate PDF documents using command-line tools. It covers text extraction, document analysis, format conversion, and batch processing for research and document workflows.

## Core Tools

### 1. pdftotext - Extract Text from PDFs
```bash
# Basic text extraction
pdftotext document.pdf document.txt

# Extract specific pages
pdftotext -f 1 -l 5 document.pdf pages_1-5.txt

# Extract with layout preservation
pdftotext -layout document.pdf document_layout.txt

# Extract from password-protected PDF
pdftotext -upw password document.pdf document.txt
```

### 2. pdfinfo - Get PDF Metadata
```bash
# Get basic PDF information
pdfinfo document.pdf

# Get specific metadata
pdfinfo -meta document.pdf

# Check encryption status
pdfinfo -enc document.pdf

# List all available info
pdfinfo -isodates -rawdates document.pdf
```

### 3. qpdf - PDF Manipulation
```bash
# Decrypt PDF
qpdf --decrypt --password=secret encrypted.pdf decrypted.pdf

# Merge multiple PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split PDF by pages
qpdf document.pdf --pages . 1-10 -- split_part1.pdf
qpdf document.pdf --pages . 11-20 -- split_part2.pdf

# Extract specific pages
qpdf document.pdf --pages . 3,5,7 -- extracted_pages.pdf

# Rotate pages
qpdf document.pdf --rotate=90:2-5 rotated.pdf  # rotate pages 2-5 by 90 degrees
```

### 4. pdftk - Advanced PDF Operations
```bash
# Combine PDFs (alternative to qpdf)
pdftk A=file1.pdf B=file2.pdf cat A B output combined.pdf

# Split PDF into individual pages
pdftk document.pdf burst output page_%03d.pdf

# Extract pages by range
pdftk document.pdf cat 1-10 15-20 output selected_pages.pdf

# Add watermark
pdftk document.pdf stamp watermark.pdf output watermarked.pdf

# Encrypt PDF
pdftk document.pdf output encrypted.pdf owner_pw secret user_pw open
```

### 5. ocrmypdf - OCR and PDF Enhancement
```bash
# Perform OCR on scanned PDF
ocrmypdf scanned.pdf ocr_output.pdf

# OCR with language specification
ocrmypdf -l eng+fra document.pdf ocr_output.pdf

# Skip text layer if already exists
ocrmypdf --skip-text document.pdf output.pdf

# Force OCR even if text exists
ocrmypdf --force-ocr document.pdf output.pdf

# Improve image quality during OCR
ocrmypdf --deskew --clean document.pdf enhanced.pdf
```

## Common PDF Workflows

### Document Analysis Pipeline
```bash
# 1. Get document metadata
pdfinfo research_paper.pdf > metadata.txt

# 2. Extract text content
pdftotext -layout research_paper.pdf content.txt

# 3. Analyze text structure
grep -n "## " content.txt  # Find section headers
grep -c "\. " content.txt  # Count sentences
wc -w content.txt  # Count words
```

### Research Paper Processing
```bash
# Extract abstract (usually first page)
pdftotext -f 1 -l 1 paper.pdf abstract.txt

# Extract references (usually last pages)
pdfinfo paper.pdf | grep Pages  # Get total pages
TOTAL_PAGES=$(pdfinfo paper.pdf | grep Pages | awk '{print $2}')
pdftotext -f $((TOTAL_PAGES-5)) -l $TOTAL_PAGES paper.pdf references.txt

# Extract figures and tables mentions
pdftotext paper.pdf full_text.txt
grep -i -n "figure\|table" full_text.txt > figures_tables.txt
```

### Batch Processing Multiple PDFs
```bash
# Extract text from all PDFs in directory
for pdf in *.pdf; do
  pdftotext "$pdf" "${pdf%.pdf}.txt"
done

# Get metadata for all PDFs
for pdf in *.pdf; do
  echo "=== $pdf ===" >> all_metadata.txt
  pdfinfo "$pdf" >> all_metadata.txt
  echo "" >> all_metadata.txt
done

# Merge all PDFs into one
qpdf --empty --pages *.pdf -- all_documents_merged.pdf
```

### Document Conversion and Cleanup
```bash
# Convert PDF to searchable text (with OCR if needed)
if pdfinfo document.pdf | grep -q "Encrypted"; then
  qpdf --decrypt --password=password document.pdf decrypted.pdf
  ocrmypdf decrypted.pdf searchable.pdf
else
  ocrmypdf document.pdf searchable.pdf
fi

# Extract clean text
pdftotext -layout searchable.pdf clean_text.txt

# Remove sensitive information
sed -i 's/credit card number/\[REDACTED\]/g' clean_text.txt
sed -i 's/SSN/\[REDACTED\]/g' clean_text.txt
```

## Integration with Other Skills

### Combine with Browser Automation
```bash
# Download PDF from web and process
agent-browser open https://arxiv.org/pdf/2401.12345.pdf
agent-browser wait --download paper.pdf
pdftotext paper.pdf paper.txt
grep -i "abstract" paper.txt | head -5
```

### Combine with Research Skills
```bash
# Extract key terms from research PDF
pdftotext research.pdf text.txt
grep -o -E '\b[A-Z][a-z]+ [A-Z][a-z]+\b' text.txt | sort | uniq -c | sort -nr > authors.txt
grep -o -E '[A-Z][A-Za-z]* [A-Z][A-Za-z]* [A-Z][A-Za-z]*' text.txt | sort | uniq > concepts.txt
```

### Combine with Finance Skills
```bash
# Extract financial data from PDF reports
pdftotext financial_report.pdf report.txt
grep -E '\$[0-9,]+(\.[0-9]{2})?' report.txt > amounts.txt
grep -i -B2 -A2 "revenue\|profit\|loss" report.txt > financial_highlights.txt
```

## Advanced Techniques

### Extract Structured Data
```bash
# Extract tables using pattern matching
pdftotext -layout data.pdf data.txt
# Look for table patterns (rows with consistent spacing)
awk 'length($0) > 50 && /[0-9][0-9.,]*[[:space:]]+[0-9][0-9.,]*/' data.txt > potential_tables.txt

# Extract dates
grep -E '[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}' document.txt > dates.txt
```

### Document Comparison
```bash
# Compare two versions of a document
pdftotext v1.pdf v1.txt
pdftotext v2.pdf v2.txt
diff v1.txt v2.txt > changes.txt

# Extract only new content
comm -13 <(sort v1.txt) <(sort v2.txt) > new_content.txt
```

### Create Search Index
```bash
# Create searchable index of PDF collection
for pdf in documents/*.pdf; do
  BASENAME=$(basename "$pdf" .pdf)
  pdftotext "$pdf" "texts/${BASENAME}.txt"
  echo "$BASENAME" >> index.txt
  head -3 "texts/${BASENAME}.txt" >> index.txt
  echo "---" >> index.txt
done

# Search across all documents
grep -r -i "machine learning" texts/ > search_results.txt
```

## Best Practices

1. **Always check PDF metadata first** to understand document structure
2. **Use `-layout` flag** with `pdftotext` to preserve document structure
3. **Handle encrypted PDFs** with appropriate decryption tools
4. **Validate extracted text** for accuracy, especially with OCR
5. **Preserve original files** before making modifications
6. **Use appropriate OCR settings** based on document language and quality
7. **Batch process large collections** with error handling

## Tool Installation

```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils qpdf pdftk ocrmypdf

# macOS (Homebrew)
brew install poppler qpdf pdftk-java ocrmypdf

# Windows (via Chocolatey)
choco install poppler qpdf pdftk ocrmypdf

# Python packages (for advanced processing)
pip install pdfminer.six pypdf2 PyPDF4
```

## Troubleshooting

**Common Issues:**
- **Encrypted PDFs**: Use `qpdf --decrypt` or `pdftk` with password
- **Scanned PDFs**: Use `ocrmypdf` for OCR text extraction
- **Corrupted PDFs**: Try `qpdf --check` to validate and repair
- **Large PDFs**: Process in chunks using page ranges
- **Encoding issues**: Specify encoding with `-enc UTF-8` in pdftotext

**Performance Tips:**
- Process large PDFs in batches
- Use `--pages` to extract only needed sections
- Cache extracted text for repeated analysis
- Parallelize batch processing with `xargs -P`

This skill enables comprehensive PDF document analysis for research, data extraction, and document management workflows.