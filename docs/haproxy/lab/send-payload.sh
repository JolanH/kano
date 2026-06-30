#!/bin/bash

NB_ITERATIONS=${1-6}

for i in $(seq 1 $NB_ITERATIONS); do curl -s localhost:8080/ | jq -c .; done
