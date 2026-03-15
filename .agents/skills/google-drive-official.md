# Google Drive Integration Skill (Official)
This skill enables seamless interaction with Google Drive, including file discovery and automatic format conversion, modeled after the official **Anthropic MCP Google Drive Server**.

## Capabilities
- **Search**: Find files and folders by name or content.
- **Access**: Read files via unique IDs.
- **Auto-Export**: Automatically converts Google Workspace files into AI-friendly formats:
  - **Google Docs** -> Markdown
  - **Google Sheets** -> CSV
  - **Google Slides** -> Plain Text
  - **Google Drawings** -> PNG
- **Native Support**: Non-workspace files are provided in their original format.

## Essential Tools/Commands
```bash
# Search for a file
gdrive search_files "Q1 Revenue Report"

# Get file content (automatically converts to Markdown if Doc)
gdrive get_file_content --file_id "ABC-123"

# List files in a folder
gdrive list_files --folder_id "XYZ-789"
```

## Example Workflow: Research Synthesis
1. `gdrive search_files "Market Research 2026"`
2. `gdrive get_file_content --file_id [doc_id_from_step_1]` (Read as Markdown)
3. `agent-browser open https://www.google.com/search?q=latest+trends+2026` (Compare with web)
4. `gdrive create_file --name "Synthesis Report" --content [market_data_plus_web_trends]`

## Reference
- **Anthropic MCP Google Drive**: `modelcontextprotocol/servers/googledrive`
