# Security Zero Trust Policy

## Decisions
- We decided to enforce strict mutual TLS with SPIFFE identities across all service endpoints.
- We chose to rotate cryptographic secrets every 24 hours using automated ephemeral tokens.

## Constraints
- Production database credentials must not be stored in environment variables or plaintext files.
- Services must never bypass authentication proxies during local testing.

## Bug Fix
- Memory exhaustion during token renewal was fixed by reusing TLS session tickets.
