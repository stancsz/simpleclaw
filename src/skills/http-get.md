---
skill_name: http-get
required_credentials: ["http_api_key"]
---

# HTTP GET Skill

This skill teaches the worker to perform an HTTP GET request to a specified URL.

## Execution Logic
1. Extract the `url` from the task parameters.
2. Use the injected `http_api_key` as a Bearer token in the `Authorization` header.
3. Perform an HTTP GET request to the URL.
4. Return the response text or JSON in the output.
