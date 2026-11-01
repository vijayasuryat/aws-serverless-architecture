import base64
import json
import os
import secrets
import time
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = ""
TABLE_REGION = ""
ALLOWED_ORIGIN = "*"

TABLE_NAME = os.environ.get("TABLE_NAME", TABLE_NAME)
TABLE_REGION = os.environ.get("TABLE_REGION", TABLE_REGION) or os.environ.get("AWS_REGION")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", ALLOWED_ORIGIN)

TABLE = boto3.resource("dynamodb", region_name=TABLE_REGION).Table(TABLE_NAME)

PROXY_HINT = (
    "API Gateway is not sending a standard request to this Lambda. "
    "Turn ON 'Use Lambda Proxy integration' for this route, then Deploy the API (see README)."
)

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
MAX_MESSAGE = 280
MAX_NAME = 40
TTL_SECONDS = 7 * 24 * 3600

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError("Cannot serialise " + type(value).__name__)

def reply(status, payload=None):
    body = json.dumps(payload, default=_json_default) if payload is not None else ""
    return {"statusCode": status, "headers": HEADERS, "body": body}

def method_of(event):
    http = (event.get("requestContext") or {}).get("http") or {}
    return (event.get("httpMethod") or http.get("method") or "").upper()

def read_body(event):
    """Return the JSON body as a dict. Accepts a JSON string, base64, or an already-parsed dict."""
    body = event.get("body")
    if body is None and "message" in event:
        return event
    if not body:
        return {}
    if isinstance(body, dict):
        return body
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("Body must be a JSON object")
    return data

def explain(err):
    """Short readable message for a DynamoDB error (full details go to CloudWatch logs)."""
    code = err.response.get("Error", {}).get("Code", "Error")
    hints = {
        "ResourceNotFoundException": "Table not found. Check TABLE_NAME and TABLE_REGION in saveNote.py.",
        "AccessDeniedException": "This Lambda's role has no permission for the table. Add dynamodb:PutItem to its role.",
        "ValidationException": "The table's partition key must be named id (type String).",
    }
    print("DynamoDB error:", err)
    return "DynamoDB " + code + ": " + hints.get(code, "see this Lambda's CloudWatch logs.")

def save_note(data):
    message = str(data.get("message") or "").strip()[:MAX_MESSAGE]
    if not message:
        return reply(400, {"error": "A note needs some text."})
    name = str(data.get("name") or "").strip()[:MAX_NAME] or "Anonymous"

    now = int(time.time())
    for _ in range(5):
        item = {
            "id": "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH)),
            "name": name,
            "message": message,
            "createdAt": now * 1000,
            "expiresAt": now + TTL_SECONDS,
        }
        try:
            TABLE.put_item(Item=item, ConditionExpression="attribute_not_exists(id)")
            return reply(200, {"id": item["id"]})
        except ClientError as err:
            if err.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                return reply(500, {"error": explain(err)})
    return reply(500, {"error": "Could not create a unique code. Please try again."})

def lambda_handler(event, context):
    try:
        method = method_of(event)
        if method == "OPTIONS":
            return reply(204)
        if method and method != "POST":
            return reply(405, {"error": "Use POST to save a note."})
        try:
            data = read_body(event)
        except (ValueError, TypeError):
            return reply(400, {"error": "Request body must be valid JSON."})
        if not method and "message" not in data:
            return reply(400, {"error": PROXY_HINT})
        return save_note(data)
    except Exception as err:
        print("Unexpected error:", repr(err))
        return reply(500, {"error": "Unexpected error (" + type(err).__name__ + "). See this Lambda's CloudWatch logs."})
