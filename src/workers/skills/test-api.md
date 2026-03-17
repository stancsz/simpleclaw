---
skill_name: test-api
required_credentials: ["test_api_key"]
---

# Test API Skill

This skill teaches the worker how to make a GET request to a public API and return the results.

## Execution Logic
When this skill is loaded, the worker should execute the following behavior:

1. Use the injected credential (`test_api_key`) to authenticate (if required).
2. Make a GET request to `https://jsonplaceholder.typicode.com/posts/1` using standard `fetch`.
3. Parse the JSON response.
4. Return the parsed JSON object in the `api_response` field of the output.
