# STRICT RULE: DOCKER CONTAINER REBUILD & SYNC ON CODE CHANGES

1. **Mandatory Container Sync**:
   - Whenever source code, schemas, or configurations are updated or fixed in any service (`api`, `web`, `scraper`, etc.), the agent MUST rebuild and push the updated image/code to the running Docker containers using `docker compose up -d --build <service_name>`.

2. **Pre-rebuild Verification**:
   - Verify code locally first (e.g., `npx tsc --noEmit` for TypeScript services) to prevent broken Docker image builds.

3. **Post-rebuild Health Verification**:
   - Check container status (`docker ps` or container logs) after rebuilding to ensure the service is running cleanly and healthy.
