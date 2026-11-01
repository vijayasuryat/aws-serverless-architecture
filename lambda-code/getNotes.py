import json
import os
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

CODE_LENGTH = 6
LATEST_COUNT = 12
PUBLIC_FIELDS = ("id", "name", "message", "createdAt")

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

def public(item):
    return {k: item[k] for k in PUBLIC_FIELDS if k in item}

def is_alive(item):

    return int(item.get("expiresAt", 0)) >= time.time()

def explain(err):
    """Short readable message for a DynamoDB error (full details go to CloudWatch logs)."""
    code = err.response.get("Error", {}).get("Code", "Error")
    hints = {
        "ResourceNotFoundException": "Table not found. Check TABLE_NAME and TABLE_REGION in getNotes.py.",
        "AccessDeniedException": "This Lambda's role has no permission for the table. Add dynamodb:GetItem and dynamodb:Scan.",
        "ValidationException": "The table's partition key must be named id (type String).",
    }
    print("DynamoDB error:", err)
    return "DynamoDB " + code + ": " + hints.get(code, "see this Lambda's CloudWatch logs.")

def get_one(note_id):
    item = TABLE.get_item(Key={"id": note_id.strip().upper()[:CODE_LENGTH]}).get("Item")
    if not item or not is_alive(item):
        return reply(404, {"error": "No note found for that code."})
    return reply(200, public(item))

def get_latest():
    resp = TABLE.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp and len(items) < 500:
        resp = TABLE.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items += resp.get("Items", [])
    items = [i for i in items if is_alive(i)]
    items.sort(key=lambda i: int(i.get("createdAt", 0)), reverse=True)
    return reply(200, [public(i) for i in items[:LATEST_COUNT]])

def lambda_handler(event, context):
    try:
        method = method_of(event)
        if method == "OPTIONS":
            return reply(204)
        if method and method != "GET":
            return reply(405, {"error": "Use GET to read notes."})
        if not method and "queryStringParameters" not in event:
            return reply(400, {"error": PROXY_HINT})
        note_id = ((event.get("queryStringParameters") or {}).get("id") or "").strip()
        return get_one(note_id) if note_id else get_latest()
    except ClientError as err:
        return reply(500, {"error": explain(err)})
    except Exception as err:
        print("Unexpected error:", repr(err))
        return reply(500, {"error": "Unexpected error (" + type(err).__name__ + "). See this Lambda's CloudWatch logs."})
