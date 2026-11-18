# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:26.13.1-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /opt/codebiz
COPY foundation/framework ./foundation/framework
RUN cd foundation/framework && npm ci --ignore-scripts --no-audit && npm run build
COPY packages/ui ./packages/ui
RUN cd packages/ui && npm ci --ignore-scripts --no-audit && npm run build
COPY devkit/codeitz ./devkit/codeitz
RUN cd devkit/codeitz && npm ci --ignore-scripts --no-audit && npm run typecheck && npm run build
COPY mcp-governance ./mcp-governance
COPY infrastructure/database-manager ./infrastructure/database-manager

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
ENV NODE_ENV=production CODEITZ_HOST=127.0.0.1 CODEITZ_PORT=4310 CODEITZ_WORKSPACE_ROOT=/workspace
ENTRYPOINT ["/bin/sh", "/opt/codebiz/devkit/codeitz/.container/entrypoint.sh"]
CMD ["node", "scripts/start.ts"]
