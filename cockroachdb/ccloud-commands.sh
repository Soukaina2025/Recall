#!/bin/bash
# ============================================================================
# Recall — ccloud CLI commands for CockroachDB Cloud management
# ============================================================================
# The ccloud CLI (Agent-Ready) gives the agent direct, secure access to the
# full CockroachDB Cloud control plane. Commands use consistent noun-verb
# patterns with JSON output on every command.
#
# Prerequisites:
#   Install ccloud CLI: https://www.cockroachlabs.com/docs/cockroachcloud/ccloud-get-started
#   Authenticate: ccloud auth login
# ============================================================================

# --- Cluster Management ---

# List all clusters in the organization
ccloud cluster list --format=json

# Get details of the Recall cluster
ccloud cluster list --format=json | jq '.[] | select(.name=="recall-cluster")'

# Provision a new Serverless cluster for the agent
ccloud cluster create serverless \
  --name=recall-cluster \
  --region=us-east-1 \
  --cloud=gcp \
  --spend-limit=0 \
  --format=json

# Get the connection string for the cluster
ccloud cluster connection-string --cluster-id=$CRDB_CLUSTER_ID --format=json

# --- Database Operations ---

# Create the recall database
ccloud db create recall --cluster-id=$CRDB_CLUSTER_ID --format=json

# List databases
ccloud db list --cluster-id=$CRDB_CLUSTER_ID --format=json

# --- SQL Execution ---

# Apply the schema to the cluster
ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall --file=cockroachdb/schema.sql

# Run a query to check memory count
ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
  --execute="SELECT category, COUNT(*) FROM memories GROUP BY category ORDER BY COUNT(*) DESC;" \
  --format=json

# Check vector index status
ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
  --execute="SHOW INDEX FROM memories;" \
  --format=json

# --- Backup Management ---

# Create a backup of the recall database
ccloud backup create \
  --cluster-id=$CRDB_CLUSTER_ID \
  --database=recall \
  --description="Recall memory backup $(date +%Y%m%d)" \
  --format=json

# List backups
ccloud backup list --cluster-id=$CRDB_CLUSTER_ID --format=json

# Restore from a backup
ccloud backup restore \
  --cluster-id=$CRDB_CLUSTER_ID \
  --backup-id=$BACKUP_ID \
  --format=json

# --- Networking ---

# List allowed IP ranges
ccloud network list --cluster-id=$CRDB_CLUSTER_ID --format=json

# Add an IP range for the agent's execution environment
ccloud network allow \
  --cluster-id=$CRDB_CLUSTER_ID \
  --cidr=0.0.0.0/0 \
  --description="Allow agent access" \
  --format=json

# --- Audit & Observability ---

# View audit logs for agent queries
ccloud audit list --cluster-id=$CRDB_CLUSTER_ID --format=json

# Get cluster metrics (CPU, memory, storage)
ccloud metrics get \
  --cluster-id=$CRDB_CLUSTER_ID \
  --metric=cpu_usage,storage_usage,sql_queries_per_second \
  --format=json

# --- Service Accounts (RBAC) ---

# Create a service account for the agent with read-only access
ccloud service-account create \
  --name=recall-agent-readonly \
  --cluster-id=$CRDB_CLUSTER_ID \
  --database=recall \
  --role=readonly \
  --format=json

# List service accounts
ccloud service-account list --cluster-id=$CRDB_CLUSTER_ID --format=json

# --- Agent Integration Examples ---

# The agent can use these commands to:
# 1. Check memory store health:
#    ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
#      --execute="SELECT COUNT(*) as total, AVG(importance) as avg_importance FROM memories;"
#
# 2. Monitor vector index performance:
#    ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
#      --execute="EXPLAIN ANALYZE SELECT * FROM memories ORDER BY embedding <=> '[...]' LIMIT 5;"
#
# 3. Export memory snapshot:
#    ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
#      --execute="COPY (SELECT * FROM memories) TO STDOUT WITH CSV HEADER;" > memory_export.csv
#
# 4. Check for duplicate memories:
#    ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall \
#      --execute="SELECT a.content, b.content, 1-(a.embedding <=> b.embedding) as sim FROM memories a JOIN memories b ON a.id < b.id WHERE a.embedding <=> b.embedding < 0.15;"
