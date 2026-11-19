# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
FROM ${NODE_IMAGE} AS build
WORKDIR /opt/codebiz
COPY foundation/framework ./foundation/framework
RUN cd foundation/framework && npm ci --install-links=false --ignore-scripts --no-audit && npm run build
COPY packages/ui ./packages/ui
RUN cd packages/ui && npm ci --install-links=false --ignore-scripts --no-audit && npm run build
COPY devkit/codeitz ./devkit/codeitz
RUN cd devkit/codeitz && npm ci --install-links=false --ignore-scripts --no-audit && npm run typecheck && npm run build
COPY mcp-governance ./mcp-governance
RUN mkdir -p infrastructure/database-manager/contracts infrastructure/database-manager/src/api/modules infrastructure/database-manager/src/web/modules infrastructure/database-manager/tests infrastructure/database-manager/docs
COPY devkit/codeitz/.container/database-manager-AGENTS.md ./infrastructure/database-manager/AGENTS.md

FROM ${NODE_IMAGE} AS runtime
ARG CODEX_CLI_VERSION=0.169.0-alpha.11.1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --ignore-scripts --no-audit @openai/codex@${CODEX_CLI_VERSION}
COPY --from=build --chown=node:node /opt/codebiz /opt/codebiz
RUN mkdir -p /workspace /opt/codebiz/devkit/codeitz/.codeitz /home/node/.codex \
    && chown node:node /workspace /opt/codebiz/devkit/codeitz/.codeitz /home/node/.codex \
    && chmod 755 /opt/codebiz/devkit/codeitz/.container/entrypoint.sh
USER node
WORKDIR /opt/codebiz/devkit/codeitz
ENV NODE_ENV=production CODEITZ_HOST=127.0.0.1 CODEITZ_PORT=4305 CODEITZ_WORKSPACE_ROOT=/workspace
ENTRYPOINT ["/bin/sh", "/opt/codebiz/devkit/codeitz/.container/entrypoint.sh"]
CMD ["node", "scripts/start.ts"]
