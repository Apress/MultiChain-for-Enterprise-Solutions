FROM ubuntu:22.04

# MultiChain Community Edition 2.3.3 (Community Edition, free for
# development and permissioned enterprise use; see Section 7.9 for
# how this differs from MultiChain Enterprise Edition licensing).
ARG MULTICHAIN_VERSION=2.3.3

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget ca-certificates jq netcat-openbsd && \
    wget -q https://www.multichain.com/download/multichain-${MULTICHAIN_VERSION}.tar.gz && \
    tar -xvzf multichain-${MULTICHAIN_VERSION}.tar.gz && \
    mv multichain-${MULTICHAIN_VERSION}/multichaind /usr/local/bin/ && \
    mv multichain-${MULTICHAIN_VERSION}/multichain-cli /usr/local/bin/ && \
    mv multichain-${MULTICHAIN_VERSION}/multichain-util /usr/local/bin/ && \
    rm -rf multichain-${MULTICHAIN_VERSION}* && \
    apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY bootstrap-streams.sh /bootstrap-streams.sh
RUN chmod +x /entrypoint.sh /bootstrap-streams.sh

EXPOSE 9740 9741
ENTRYPOINT ["/entrypoint.sh"]
