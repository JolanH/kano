#!/usr/bin/env bash
# Seed the `products` index used by the query, relevance, and aggregation
# lessons (04-06). Idempotent: deletes and recreates the index each run.
#
#   cd docs/elasticsearch/lab && ./seed-data.sh
#
# Reads ELASTIC_PASSWORD / ES_PORT from .env. Talks HTTPS with the lab CA.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source .env

ES="https://localhost:${ES_PORT}"
CA="certs/ca/ca.crt"
AUTH="elastic:${ELASTIC_PASSWORD}"

# The CA lives inside the container's cert volume; copy it out so host curl can
# verify TLS. (Falls back to -k if the copy fails, e.g. cluster not up yet.)
mkdir -p certs/ca
docker compose cp es01:/usr/share/elasticsearch/config/certs/ca/ca.crt "$CA" 2>/dev/null || true
CACURL=(--cacert "$CA"); [ -f "$CA" ] || CACURL=(-k)

echo "Recreating index 'products'..."
curl -s "${CACURL[@]}" -u "$AUTH" -X DELETE "$ES/products" >/dev/null || true
curl -s "${CACURL[@]}" -u "$AUTH" -X PUT "$ES/products" \
  -H 'Content-Type: application/json' -d '{
  "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
  "mappings": {
    "properties": {
      "name":     { "type": "text",
                    "fields": { "raw": { "type": "keyword" } } },
      "category": { "type": "keyword" },
      "brand":    { "type": "keyword" },
      "price":    { "type": "scaled_float", "scaling_factor": 100 },
      "rating":   { "type": "half_float" },
      "in_stock": { "type": "boolean" },
      "tags":     { "type": "keyword" },
      "created":  { "type": "date" }
    }
  }
}' >/dev/null

echo "Bulk-loading documents..."
curl -s "${CACURL[@]}" -u "$AUTH" -X POST "$ES/products/_bulk?refresh=wait_for" \
  -H 'Content-Type: application/x-ndjson' --data-binary @- <<'NDJSON' | grep -o '"errors":[a-z]*'
{"index":{"_id":"1"}}
{"name":"Aeron Ergonomic Office Chair","category":"chairs","brand":"Herman Miller","price":1395.00,"rating":4.8,"in_stock":true,"tags":["ergonomic","mesh","premium"],"created":"2025-01-12"}
{"index":{"_id":"2"}}
{"name":"Standing Desk Converter","category":"desks","brand":"Vari","price":295.00,"rating":4.3,"in_stock":true,"tags":["standing","adjustable"],"created":"2025-02-03"}
{"index":{"_id":"3"}}
{"name":"Mechanical Keyboard MX Blue","category":"peripherals","brand":"Keychron","price":89.99,"rating":4.6,"in_stock":true,"tags":["mechanical","wireless"],"created":"2025-02-20"}
{"index":{"_id":"4"}}
{"name":"Ultrawide 34in Monitor","category":"monitors","brand":"LG","price":749.00,"rating":4.5,"in_stock":false,"tags":["ultrawide","hdr"],"created":"2025-03-01"}
{"index":{"_id":"5"}}
{"name":"USB-C Docking Station","category":"peripherals","brand":"CalDigit","price":249.00,"rating":4.4,"in_stock":true,"tags":["thunderbolt","hub"],"created":"2025-03-15"}
{"index":{"_id":"6"}}
{"name":"Ergonomic Mesh Task Chair","category":"chairs","brand":"Steelcase","price":520.00,"rating":4.2,"in_stock":true,"tags":["ergonomic","mesh"],"created":"2025-03-22"}
{"index":{"_id":"7"}}
{"name":"Electric Standing Desk 60in","category":"desks","brand":"Uplift","price":699.00,"rating":4.7,"in_stock":true,"tags":["standing","adjustable","premium"],"created":"2025-04-04"}
{"index":{"_id":"8"}}
{"name":"Wireless Ergonomic Mouse","category":"peripherals","brand":"Logitech","price":99.00,"rating":4.5,"in_stock":true,"tags":["ergonomic","wireless"],"created":"2025-04-18"}
{"index":{"_id":"9"}}
{"name":"4K Webcam Pro","category":"peripherals","brand":"Logitech","price":199.00,"rating":4.1,"in_stock":false,"tags":["4k","video"],"created":"2025-05-02"}
{"index":{"_id":"10"}}
{"name":"Curved Gaming Monitor 27in","category":"monitors","brand":"Samsung","price":329.00,"rating":4.3,"in_stock":true,"tags":["curved","gaming","hdr"],"created":"2025-05-19"}
{"index":{"_id":"11"}}
{"name":"Leather Executive Chair","category":"chairs","brand":"La-Z-Boy","price":410.00,"rating":3.9,"in_stock":true,"tags":["leather","executive"],"created":"2025-06-01"}
{"index":{"_id":"12"}}
{"name":"Compact Sit-Stand Desk","category":"desks","brand":"Vari","price":450.00,"rating":4.0,"in_stock":false,"tags":["standing","compact"],"created":"2025-06-14"}
{"index":{"_id":"13"}}
{"name":"Noise Cancelling Headset","category":"peripherals","brand":"Sony","price":279.00,"rating":4.7,"in_stock":true,"tags":["audio","wireless","premium"],"created":"2025-06-28"}
{"index":{"_id":"14"}}
{"name":"Dual Monitor Arm","category":"peripherals","brand":"Ergotron","price":189.00,"rating":4.6,"in_stock":true,"tags":["ergonomic","mount"],"created":"2025-07-05"}
{"index":{"_id":"15"}}
{"name":"27in 5K Retina Monitor","category":"monitors","brand":"LG","price":1299.00,"rating":4.8,"in_stock":true,"tags":["5k","premium","hdr"],"created":"2025-07-11"}
NDJSON

echo
echo "Done. Try:  GET /products/_count"
