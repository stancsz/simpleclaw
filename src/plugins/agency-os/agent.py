#!/usr/bin/env python3
import sys
import json
import argparse

def process_message(message):
    """
    Simulates an external agency-os agent processing a message.
    It takes the input message and produces a structured response.
    """
    # Simple logic to demonstrate the message was actually processed
    word_count = len(message.split())

    response = {
        "status": "success",
        "agent": "agency-os-mock-agent",
        "processed_message": message,
        "analysis": f"Message received and analyzed. Word count: {word_count}.",
        "reply": f"Hello! I am the external agent. You said: '{message}'"
    }

    return json.dumps(response, indent=2)

def main():
    parser = argparse.ArgumentParser(description="Agency OS Mock Agent")
    parser.add_argument("--message", type=str, required=True, help="The message to process")
    args = parser.parse_args()

    try:
        result = process_message(args.message)
        print(result)
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
