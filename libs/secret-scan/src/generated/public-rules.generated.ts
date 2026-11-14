// Generated. Do not edit.
// Regenerate it with: bun run --cwd libs/secret-scan rules:build
//
// Source: github.com/betterleaks/betterleaks, tag v1.9.0
// Commit: 81aff7a638638aae3a659845d089043e1d8fe9ac
// File: config/betterleaks.toml
// SHA-256: a8f553eb634ac3c5c1ca3f0dc95e2b8abdea7d14b622604c5af07f30ce7926ef
//
// The licence of the source:
//
// MIT License
//
// Copyright (c) 2026 Zachary Rice
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// The rules that never fire, because a URL has no file to match:
//   freemius-secret-key: it matches a file path
//   hashicorp-tf-password: it matches a file path
//   kubernetes-secret-yaml: it matches a file path
//   nuget-config-password: it matches a file path
//   pkcs12-file: it has no regex
//
// The filter clauses left out, because each reads more than the secret or the match.
// A clause left out never discards a finding:
//   adafruit-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   adobe-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   airtable-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   airtable-oauth-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   airtable-personnal-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   aiven-auth-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   algolia-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   algolia-application-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   alibaba-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   alibaba-sts-access-key-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   alibaba-sts-security-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   amplitude-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   apollo-api-key.1: filter.tokenRatio(finding["secret"]) >= 2.5
//   asana-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   assemblyai-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   atlassian-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   bitbucket-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   bitbucket-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   bitbucket-data-center-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   bitly-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   bitrise-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   bittrex-access-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   bittrex-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   box-api-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   circleci-personal-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   circleci-project-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   cisco-meraki-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   civo-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   cloudflare-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   cloudflare-global-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   cloudflare-origin-ca-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   cloudinary-api-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   codecov-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   cohere-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   coinbase-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   confluent-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   confluent-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   contentful-delivery-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   coveralls-personal-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   datagov-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   deepgram-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   discord-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   discord-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   disqus-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   droneci-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   dropbox-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   dropbox-long-lived-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   dropbox-short-lived-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   facebook-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   facebook-page-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   facebook-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   fastly-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   finicity-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   finicity-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   finnhub-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   flickr-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   freshbooks-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   generic-api-key: filter.failsTokenEfficiency(finding["secret"])
//   generic-api-key: filter.matchesAny(genericMatchContext, [`(?i)(?:access(?:ibility|or)|access[_...
//   generic-api-key: matchesAny(finding["line"], [ `--mount=type=secret,`, `import[ \t]+{[ \t\w,]+...
//   generic-api-key: matchesAny(attributes["path"], [ `\.bb$`, `\.bbappend$`, `\.bbclass$`, `\.inc...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_test_[A-Za-z0-9]{24}(?:[A-Za-z0-9]{10})?(...
//   generic-api-key: matchesAny(finding["secret"], [`^rk_test_[A-Za-z0-9]{24}(?:[A-Za-z0-9]{10})?(...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_live_[A-Za-z0-9]{24}(?:[A-Za-z0-9]{10})?(...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_test_[A-Za-z0-9_-]{40}$`]) && filter.cont...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_live_[A-Za-z0-9_-]{40}$`]) && filter.cont...
//   generic-api-key: matchesAny(finding["secret"], [`^sandbox_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{16}$`])...
//   generic-api-key: matchesAny(finding["secret"], [`^production_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{16}$...
//   generic-api-key: matchesAny(finding["secret"], [`^test_[0-9a-zA-Z]{32}$`]) && filter.containsA...
//   generic-api-key: matchesAny(finding["secret"], [`^live_[0-9a-zA-Z]{32}$`]) && filter.containsA...
//   generic-api-key: matchesAny(finding["secret"], [`^[A-Za-z0-9]{32}$`]) && filter.containsAny(pr...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: matchesAny(finding["secret"], [`^TEST-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{32}$`]) && filter.containsAny(pr...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-z]{6}\/[a-z_-]{2,100}$`]) && filter.co...
//   generic-api-key: len(finding["secret"]) == 8 && matchesAny(finding["secret"], [`^[0-9a-f]{8}$`...
//   generic-api-key: (len(finding["secret"]) >= 21 && len(finding["secret"]) <= 24) && matchesAny(...
//   generic-api-key: matchesAny(finding["secret"], [`^key_live_[0-9a-zA-Z]{32}$`]) && filter.conta...
//   generic-api-key: matchesAny(finding["secret"], [`^key_test_[0-9a-zA-Z]{32}$`]) && filter.conta...
//   generic-api-key: matchesAny(finding["secret"], [`^pub[0-9a-zA-Z]{32}$`]) && filter.containsAny...
//   generic-api-key: len(finding["secret"]) == 6 && matchesAny(finding["secret"], [`^[0-9a-zA-Z]{6...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-zA-Z]{32}$`]) && filter.containsAny(pr...
//   generic-api-key: matchesAny(finding["secret"], [`^search-[0-9a-zA-Z_-]{24}$`]) && filter.conta...
//   generic-api-key: len(finding["secret"]) == 20 && matchesAny(finding["secret"], [`^[0-9a-zA-Z_-...
//   generic-api-key: matchesAny(finding["secret"], [`^pk.eyJ1Ijoi[0-9a-zA-Z_-]{1,}\.[0-9a-zA-Z-_]{...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: matchesAny(finding["secret"], [`^client-[a-zA-Z0-9]{43}$`]) && filter.contain...
//   generic-api-key: matchesAny(finding["secret"], [`^sdk-[a-zA-Z0-9]{15,16}$`]) && filter.contain...
//   generic-api-key: len(finding["secret"]) == 24 && matchesAny(finding["secret"], [`^[a-zA-Z0-9\/...
//   generic-api-key: (len(finding["secret"]) >= 21 && len(finding["secret"]) <= 22) && matchesAny(...
//   generic-api-key: len(finding["secret"]) == 24 && matchesAny(finding["secret"], [`^[0-9a-fA-F]{...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_test_[0-9a-zA-Z]{20,70}$`]) && filter.con...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_live_[0-9a-zA-Z]{20,70}$`]) && filter.con...
//   generic-api-key: len(finding["secret"]) == 40 && matchesAny(finding["secret"], [`^[0-9a-zA-Z]{...
//   generic-api-key: (len(finding["secret"]) >= 5 && len(finding["secret"]) <= 6) && matchesAny(fi...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: len(finding["secret"]) == 27 && matchesAny(finding["secret"], [`^[0-9a-zA-Z]{...
//   generic-api-key: matchesAny(finding["secret"], [`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}...
//   generic-api-key: len(finding["secret"]) == 12 && matchesAny(finding["secret"], [`^[0-9]{12}$`]...
//   generic-api-key: matchesAny(finding["secret"], [`^test_[a-zA-Z0-9]{27}$`]) && filter.containsA...
//   generic-api-key: matchesAny(finding["secret"], [`^live_[a-zA-Z0-9]{27}$`]) && filter.containsA...
//   generic-api-key: matchesAny(finding["secret"], [`^pk_live_[0-9A-F]{16}$`]) && filter.containsA...
//   generic-password: hasNonPlaintextPasswordContext && filter.matchesAny(finding["secret"], [ `(?i...
//   generic-password: isCodeFile && isUnquotedAssignment
//   generic-username: isCodeFile && filter.matchesAny(finding["match"], [ `^(?:[^a-zA-Z0-9])?(?i:us...
//   gitea-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   github-app-token: matchesAny(attributes["path"], [`(?:^|/)@octokit/auth-token/README\.md$`])
//   github-pat: matchesAny(attributes["path"], [`(?:^|/)@octokit/auth-token/README\.md$`])
//   gitter-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   greptile-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   gumroad-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   honeycomb-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   influxdb-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   infomaniak-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   intercom-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   jumpcloud-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   kraken-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   kucoin-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   kucoin-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   lark-app-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   lark-app-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   launchdarkly-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   lighton-paradigm-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   linear-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   linear-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   linkedin-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   linkedin-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   looker-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   looker-client-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   mattermost-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   messagebird-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   messagebird-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   mistral-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   netlify-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   new-relic-browser-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   new-relic-insert-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   new-relic-user-api-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   new-relic-user-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   nytimes-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   openweather-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   plaid-client-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   plaid-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   plivo-auth-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   plivo-auth-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   privateai-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   rapidapi-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   sendbird-access-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   sendbird-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   sentry-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   sentry-org-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   sentry-user-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   snowflake-programmatic-access-token.1: filter.tokenRatio(finding["secret"]) >= 2.5
//   sslmate-api-key.1: filter.tokenRatio(finding["secret"]) >= 2.5
//   sumologic-access-id: filter.tokenRatio(finding["secret"]) >= 2.5
//   sumologic-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   travisci-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitch-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitter-access-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitter-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitter-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitter-api-secret: filter.tokenRatio(finding["secret"]) >= 2.5
//   twitter-bearer-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   upstage-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-ai-gateway-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-api-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-app-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-app-refresh-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-integration-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   vercel-personal-access-token: filter.tokenRatio(finding["secret"]) >= 2.5
//   weatherstack-api-key.1: filter.tokenRatio(finding["secret"]) >= 2.5
//   weights-and-biases-api-key: filter.tokenRatio(finding["secret"]) >= 2.5
//   weights-and-biases-api-key-v1: filter.tokenRatio(finding["secret"]) >= 2.5
//   zendesk-secret-key: filter.tokenRatio(finding["secret"]) >= 2.5

import type { FilterClause, Rule } from '../types';

export const publicFilter = [
  {
    "kind": "matches",
    "target": "secret",
    "patterns": [
      "(?i)^true|false|null$",
      "^(?i:a+|b+|c+|d+|e+|f+|g+|h+|i+|j+|k+|l+|m+|n+|o+|p+|q+|r+|s+|t+|u+|v+|w+|x+|y+|z+|\\*+|\\.+)$",
      "^\\$(?:\\d+|{\\d+})$",
      "^\\$(?:[A-Z_]+|[a-z_]+)$",
      "^\\${(?:[A-Z_]+|[a-z_]+)}$",
      "^\\{\\{[ \\t]*[\\w ().|]+[ \\t]*}}$",
      "^\\$\\{\\{[ \\t]*(?:(?:env|github|secrets|vars)(?:\\.[A-Za-z]\\w+)+[\\w \"'&./=|]*)[ \\t]*}}$",
      "^%(?:[A-Z_]+|[a-z_]+)%$",
      "^%[+\\-# 0]?[bcdeEfFgGoOpqstTUvxX]$",
      "^\\{\\d{0,2}}$",
      "^@(?:[A-Z_]+|[a-z_]+)@$",
      "^/Users/(?i)[a-z0-9]+/[\\w .-/]+$",
      "^/(?:bin|etc|home|opt|tmp|usr|var)/[\\w ./-]+$"
    ],
    "isNegated": false
  },
  {
    "kind": "contains",
    "target": "secret",
    "values": [
      "abcdefghijklmnopqrstuvwxyz",
      "014df517-39d1-4453-b7b3-9930c563627c"
    ],
    "isNegated": false
  }
] satisfies readonly FilterClause[];

export const publicRules = [
  {
    "id": "1password-secret-key",
    "regex": "\\bA3-[A-Z0-9]{6}-(?:(?:[A-Z0-9]{11})|(?:[A-Z0-9]{6}-[A-Z0-9]{5}))-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\\b",
    "keywords": [
      "a3-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.8,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "1password-service-account-token",
    "regex": "ops_eyJ[a-zA-Z0-9+/]{250,}={0,3}",
    "keywords": [
      "ops_eyj"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "abuseipdb-api-key.1",
    "regex": "(?i)(?:abuseipdb)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "abuseipdb"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "adafruit-api-key",
    "regex": "(?i)(?:adafruit)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "adafruit"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "adobe-client-id",
    "regex": "(?i)(?:adobe)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "adobe"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "adobe-client-secret",
    "regex": "\\b(p8e-(?i)[a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "p8e-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "age-secret-key",
    "regex": "AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}",
    "keywords": [
      "age-secret-key-1"
    ]
  },
  {
    "id": "aikido-ci-token",
    "regex": "\\b(AIK_CI_[A-Za-z0-9]{20,44})\\b",
    "keywords": [
      "aik_ci_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "aikido-client-id",
    "regex": "\\b(AIK_CLIENT_[A-Za-z0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "aik_client_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "aikido-client-secret",
    "regex": "\\b(AIK_SECRET_[A-Za-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "aik_secret_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "aikido-client-id"
    ]
  },
  {
    "id": "airtable-api-key",
    "regex": "(?i)(?:airtable)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{17})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "airtable"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "airtable-oauth-token",
    "regex": "(?i)(?:airtable)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Z0-9]+\\.v1\\.[A-Z0-9_-]+\\.[a-f0-9]+)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "airtable"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "airtable-personnal-access-token",
    "regex": "\\b(pat[[:alnum:]]{14}\\.[a-f0-9]{64})\\b",
    "keywords": [
      "airtable"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "aiven-auth-token",
    "regex": "(?i:aiven)[\\s\\S]{0,32}?\\b([A-Za-z0-9/+=]{372})(?:[^A-Za-z0-9/+=]|$)",
    "keywords": [
      "aiven"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "algolia-api-key",
    "regex": "(?i)(?:algolia)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "algolia"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "algolia-application-id"
    ]
  },
  {
    "id": "algolia-application-id",
    "regex": "(?i)(?:algolia)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{10})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "algolia"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.75,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "alibaba-access-key-id",
    "regex": "\\b(LTAI[A-Za-z0-9]{17,21})\\b",
    "keywords": [
      "ltai"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "alibaba-secret-key",
    "regex": "(?i)(?:alibaba|aliyun|secret|key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "alibaba",
      "aliyun"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "alibaba-access-key-id"
    ]
  },
  {
    "id": "alibaba-sts-access-key-id",
    "regex": "\\b(STS\\.[A-Za-z0-9]{16,64})\\b",
    "keywords": [
      "sts."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "alibaba-sts-access-key-secret",
    "regex": "(?i)(?:alibaba|aliyun|secret|key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{30,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "alibaba",
      "aliyun"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "alibaba-sts-access-key-id",
      "alibaba-sts-security-token"
    ]
  },
  {
    "id": "alibaba-sts-security-token",
    "regex": "(?i)(?:alibaba|aliyun|secret|key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(CAIS[A-Za-z0-9+/_=-]{20,1000}[A-Za-z0-9+/_=-]{0,24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "alibaba",
      "aliyun",
      "cais"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "amplitude-secret-key",
    "regex": "(?i)\\bamplitude(?:.|[\\n\\r]){0,32}?(?:SECRET|PRIVATE|ACCESS|KEY|TOKEN|AUTHORIZATION)(?:.|[\\n\\r]){0,16}?\\b([a-f0-9]{32})\\b",
    "keywords": [
      "amplitude"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "anthropic-admin-api-key",
    "regex": "\\b(sk-ant-admin01-[a-zA-Z0-9_\\-]{93}AA)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk-ant-admin01"
    ]
  },
  {
    "id": "anthropic-api-key",
    "regex": "\\b(sk-ant-api03-[a-zA-Z0-9_\\-]{93}AA)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk-ant-api03"
    ]
  },
  {
    "id": "apify-api-token",
    "regex": "\\b(apify_api_[A-Za-z0-9]{34,38})\\b",
    "keywords": [
      "apify_api_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "apollo-api-key.1",
    "regex": "(?i:(?:apollo)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{22})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "apollo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "artifactory-api-key",
    "regex": "\\bAKCp[A-Za-z0-9]{68,70}\\b",
    "keywords": [
      "akcp"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "artifactory-jfrog-url"
    ]
  },
  {
    "id": "artifactory-jfrog-url",
    "regex": "(?i)(?:^|[^a-z0-9-])([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.jfrog\\.io)(?:$|[^a-z0-9-])",
    "keywords": [
      "jfrog.io"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.5,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "artifactory-reference-token",
    "regex": "\\bcmVmd[A-Za-z0-9]{59}\\b",
    "keywords": [
      "cmvmd"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "artifactory-jfrog-url"
    ]
  },
  {
    "id": "asaas-api-token",
    "regex": "(?:^|[^A-Za-z0-9_-])(\\$aact_(?:prod|hmlg)_[A-Za-z0-9_-]{20,100})(?:[^A-Za-z0-9_-]|$)",
    "keywords": [
      "$aact_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "asana-client-id",
    "regex": "(?i)(?:asana)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "asana"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.75,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "asana-client-secret",
    "regex": "(?i)(?:asana)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "asana"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "assemblyai-api-key",
    "regex": "(?i)(?:assemblyai)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "assemblyai"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "atlassian-api-token",
    "regex": "\\b(ATAT[A-Za-z0-9_\\-=]{100,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "atat"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "auth0-client-id.1",
    "regex": "(?i:(?:auth0[_.-]?(?:client[_.-]?)?(?:id|identifier))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{32,60})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "auth0"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "auth0-client-secret.1",
    "regex": "(?i:(?:auth0[_.-]?(?:client[_.-]?)?(?:secret|private|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{64,128})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "auth0"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "auth0-client-id.1",
      "auth0-domain.1"
    ]
  },
  {
    "id": "auth0-domain.1",
    "regex": "(?i)\\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+auth0\\.com)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "auth0.com"
    ],
    "skipReport": true
  },
  {
    "id": "authress-service-client-access-key",
    "regex": "(?i)\\b((?:sc|ext|scauth|authress)_[a-z0-9]{5,30}\\.[a-z0-9]{4,6}\\.acc[_-][a-z0-9-]{10,32}\\.[a-z0-9+/_=-]{30,120})\\b",
    "keywords": [
      ".acc_",
      ".acc-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "aws-access-token",
    "regex": "\\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\\b",
    "keywords": [
      "a3t",
      "akia",
      "asia",
      "abia",
      "acca"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          ".+EXAMPLE$"
        ],
        "isNegated": false
      }
    ],
    "components": [
      "aws-secret-access-key"
    ]
  },
  {
    "id": "aws-amazon-bedrock-api-key-long-lived",
    "regex": "\\b(ABSK[A-Za-z0-9+/]{109,269}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "absk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "aws-amazon-bedrock-api-key-short-lived",
    "regex": "bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t",
    "keywords": [
      "bedrock-api-key-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "aws-secret-access-key",
    "regex": "(?i:(?:secret|access|key|token)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9/+=]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "secret",
      "access",
      "key",
      "token"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "azure-ad-client-secret",
    "regex": "(?:^|[\\\\'\"\\x60\\s>=:(,)])([a-zA-Z0-9_~.]{3}\\dQ~[a-zA-Z0-9_~.-]{31,34})(?:$|[\\\\'\"\\x60\\s<),])",
    "keywords": [
      "0q~",
      "1q~",
      "2q~",
      "3q~",
      "4q~",
      "5q~",
      "6q~",
      "7q~",
      "8q~",
      "9q~"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "components": [
      "azure-tenant-id",
      "azure-client-id"
    ]
  },
  {
    "id": "azure-app-configuration-connection-string",
    "regex": "(?i)Endpoint=(?P<azure_appconfig_endpoint>https://[a-z0-9-]+\\.azconfig\\.io);Id=(?P<azure_appconfig_id>[^;\\s'\"]{4,80});Secret=([A-Za-z0-9+/]{36,100}={0,2})",
    "keywords": [
      "azconfig.io",
      "endpoint=",
      "secret="
    ],
    "secretGroup": 3,
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "azure-client-id",
    "regex": "(?i)\\b(?:client[_\\s.-]*id|AZURE_CLIENT_ID)\\b(?s:.{0,24}?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\b",
    "keywords": [
      "client"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.5,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "azure-servicebus-connection-string",
    "regex": "(?i)(Endpoint=sb://[a-z0-9-]+\\.servicebus\\.windows\\.net/;SharedAccessKeyName=[^;=\\s'\"]{1,128};SharedAccessKey=[A-Za-z0-9+/]{32,100}={0,2}(?:;EntityPath=[^;\\s'\"]{1,128})?)",
    "keywords": [
      "endpoint=sb://",
      "sharedaccesskey"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "azure-storage-account-key",
    "regex": "(?i)\\b(?:AccountKey|(?:azure[_\\s.-]*)?(?:storage[_\\s.-]*)?(?:account[_\\s.-]*)?(?:access[_\\s.-]*)?key)\\b(?s:.{0,24}?)([A-Za-z0-9+/]{86}==)",
    "keywords": [
      "accountkey",
      "storage",
      "accesskey",
      "access_key",
      "access-key"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ],
    "components": [
      "azure-storage-account-name"
    ]
  },
  {
    "id": "azure-storage-account-name",
    "regex": "(?i)(?:\\bAccountName\\s*=\\s*([a-z0-9]{3,24})\\b|https://([a-z0-9]{3,24})\\.blob\\.core\\.windows\\.net\\b|\\b(?:azure[_\\s.-]*storage[_\\s.-]*(?:account[_\\s.-]*)?name|storage[_\\s.-]*account[_\\s.-]*name)\\b(?s:.{0,24}?)([a-z0-9]{3,24})\\b)",
    "keywords": [
      "accountname",
      "blob.core.windows.net",
      "storage"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 1.5,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "azure-tenant-id",
    "regex": "(?i)\\b(?:tenant[_\\s.-]*(?:id)?|AZURE_TENANT_ID)\\b(?s:.{0,24}?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\b",
    "keywords": [
      "tenant"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.5,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "beamer-api-token",
    "regex": "(?i)(?:beamer)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(b_[a-z0-9=_\\-]{44})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "beamer"
    ]
  },
  {
    "id": "bitbucket-client-id",
    "regex": "(?i)(?:bitbucket)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bitbucket"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bitbucket-client-secret",
    "regex": "(?i)(?:bitbucket)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bitbucket"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bitbucket-data-center-token",
    "regex": "\\b(BBDC-[A-Za-z0-9+/=]{32,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bbdc"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bitly-access-token",
    "regex": "(?i)\\bbitly(?:.|[\\n\\r]){0,32}?(?:SECRET|PRIVATE|ACCESS|KEY|TOKEN)(?:.|[\\n\\r]){0,32}?([a-f0-9]{40})\\b",
    "keywords": [
      "bitly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bitrise-access-token",
    "regex": "(?i:(?:bitrise(?:[ _-]*(?:personal|workspace))?(?:[ _-]*(?:access|api))?[ _-]*token)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{60,120})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bitrise"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bittrex-access-key",
    "regex": "(?i)(?:bittrex)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bittrex"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "bittrex-secret-key",
    "regex": "(?i)(?:bittrex)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bittrex"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "box-api-access-token",
    "regex": "(?i)(?:box)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "box_",
      "box-",
      "boxt",
      "boxk",
      "boxa"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "brave-search-api-key",
    "regex": "\\b(BSA[A-Za-z0-9_-]{24,40})\\b",
    "keywords": [
      "bsa"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.2,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "browserstack-access-key.1",
    "regex": "(?i:(?:browserstack[_.-]?(?:access[_.-]?)?(?:key|secret|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "browserstack"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "components": [
      "browserstack-username.1"
    ]
  },
  {
    "id": "browserstack-username.1",
    "regex": "(?i:(?:browserstack[_.-]?(?:username|user))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9][A-Za-z0-9._-]{2,39})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "browserstack"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "buildkite-service-token",
    "regex": "\\b(bkaa_[A-Za-z0-9_-]{75}|bkaj_[A-Za-z0-9_-]{333}|bkar_[A-Za-z0-9_-]{73}|bkct_[A-Za-z0-9_-]{73}|bkpt_[A-Za-z0-9_-]{199}|bkpat_[A-Za-z0-9_-]{54}|bkps_[A-Za-z0-9_-]{64})(?:$|[^A-Za-z0-9_-])",
    "keywords": [
      "bkaa_",
      "bkaj_",
      "bkar_",
      "bkct_",
      "bkpt_",
      "bkpat_",
      "bkps_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "buildkite-user-access-token",
    "regex": "\\b(bkua_(?:[a-z0-9]{40}|[a-z0-9]{53}))\\b",
    "keywords": [
      "bkua_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "canadian-digital-service-notify-api-key",
    "regex": "(?i:\\b(ApiKey-v1\\s+gcntfy-[a-z0-9_]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\b)",
    "keywords": [
      "gcntfy-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "canva-client-id",
    "regex": "(?i)\\b(?:canva|CANVA_CLIENT_ID)(?:.|[\\n\\r]){0,32}?(?:client[_\\s-]*id|app[_\\s-]*id)(?:.|[\\n\\r]){0,16}?\\b(OC-[A-Za-z0-9_-]{8,16})\\b",
    "keywords": [
      "canva"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.5,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "canva-client-secret",
    "regex": "\\b(cnvca[a-zA-Z0-9_-]{51})\\b",
    "keywords": [
      "cnvca"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "canva-client-id"
    ]
  },
  {
    "id": "cartesia-api-key.1",
    "regex": "\\b(sk_car_[A-Za-z0-9_]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk_car_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cerebras-api-key",
    "regex": "(?i)\\b(csk-[a-z0-9]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "csk-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "checkout-secret-key",
    "regex": "(?i)(?:checkout)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "checkout"
    ]
  },
  {
    "id": "circleci-personal-token",
    "regex": "\\b(CCIPAT_[a-zA-Z0-9]{22}_[a-z0-9]{40})",
    "keywords": [
      "ccipat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "circleci-project-token",
    "regex": "(?i)(?:circleci)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "circleci"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cisco-meraki-api-key",
    "regex": "(?i:(?:(?-i:[Mm]eraki|MERAKI))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "meraki"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "civo-api-key",
    "regex": "(?i)(?:civo)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{50})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "civo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "clerk-secret-key",
    "regex": "(?i)(?:clerk)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk_(?:test|live)_[A-Za-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "clerk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "clickhouse-cloud-api-secret-key",
    "regex": "\\b(4b1d[A-Za-z0-9]{38})\\b",
    "keywords": [
      "4b1d"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "clickhouse-cloud-key-id"
    ]
  },
  {
    "id": "clickhouse-cloud-key-id",
    "regex": "(?i)\\bclickhouse(?:.|[\\n\\r]){0,16}?(?:ID|USER)(?:.|[\\n\\r]){0,16}?([a-z0-9]{20})",
    "keywords": [
      "clickhouse"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "clickup-personal-api-token",
    "regex": "(?i)(?:clickup)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(pk_[0-9]{8,9}_[a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "clickup"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "clojars-api-token",
    "regex": "(?i)CLOJARS_[a-z0-9]{60}",
    "keywords": [
      "clojars_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "cloudflare-api-key",
    "regex": "(?i)(?:cloudflare)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cloudflare"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cloudflare-global-api-key",
    "regex": "(?i)(?:cloudflare)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{37})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cloudflare"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cloudflare-origin-ca-key",
    "regex": "\\b(v1\\.0-[a-f0-9]{24}-[a-f0-9]{146})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cloudflare",
      "v1.0-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cloudinary-api-key",
    "regex": "(?i)\\bcloudinary(?:.|[\\n\\r]){0,32}?(?:API[_\\s]?KEY|KEY)(?:.|[\\n\\r]){0,16}?\\b([0-9]{15})\\b",
    "keywords": [
      "cloudinary"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.75,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "cloudinary-api-secret",
    "regex": "(?i)\\bcloudinary(?:.|[\\n\\r]){0,32}?(?:SECRET|PRIVATE|API[_\\s]?SECRET)(?:.|[\\n\\r]){0,32}?\\b([A-Za-z0-9]{32})\\b",
    "keywords": [
      "cloudinary"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "cloudinary-api-key",
      "cloudinary-cloud-name"
    ]
  },
  {
    "id": "cloudinary-cloud-name",
    "regex": "(?i)\\bcloudinary(?:.|[\\n\\r]){0,32}?(?:CLOUD[_\\s]?NAME|CLOUD)(?:.|[\\n\\r]){0,16}?\\b([a-z0-9_-]{3,32})\\b",
    "keywords": [
      "cloudinary"
    ],
    "skipReport": true
  },
  {
    "id": "cloudsmith-api-key",
    "regex": "\\b(csa_[a-f0-9]{30}[A-Za-z0-9]{6})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "csa_"
    ]
  },
  {
    "id": "cockroachlabs-cloud-api-key",
    "regex": "\\b(CCDB1_[A-Za-z0-9]{22}_[A-Za-z0-9]{40})\\b",
    "keywords": [
      "ccdb1_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "codecov-access-token",
    "regex": "(?i)(?:codecov)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Z0-9-]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "codecov"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "cohere-api-token",
    "regex": "(?i:(?:cohere|CO_API_KEY)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-zA-Z0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cohere",
      "co_api_key"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "coinbase-access-token",
    "regex": "(?i)(?:coinbase)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "coinbase"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "configcat-sdk-key",
    "regex": "(?i)(?:configcat)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{22}/[A-Za-z0-9_-]{22})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "configcat"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "configcat-sdk-key-extended",
    "regex": "\\b(configcat-sdk-1/[A-Za-z0-9_-]{22}/[A-Za-z0-9_-]{22})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "configcat-sdk-1"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "confluent-access-token",
    "regex": "(?i)(?:confluent)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "confluent"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "confluent-secret-key",
    "regex": "(?i)(?:confluent)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "confluent"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "contentful-delivery-api-token",
    "regex": "(?i)(?:contentful)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "contentful"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "couchbase-capella-api-key",
    "regex": "(?i)\\b(?:couchbase|capella)(?:.|[\\n\\r]){0,32}?(?:api(?:.|[\\n\\r]){0,12}?(?:key|secret)|key(?:.|[\\n\\r]){0,12}?secret)(?:.|[\\n\\r]){0,32}?\\b([A-Za-z0-9+/]{60,120}={0,2})\\b",
    "keywords": [
      "couchbase",
      "capella"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "coveralls-personal-api-token",
    "regex": "(?i)(?:coveralls)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9-]{37})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "coveralls"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "crates-io-api-key",
    "regex": "(?i)(?:crates(?:[_.-]?io)?)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(cio[A-Za-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "crates"
    ]
  },
  {
    "id": "curl-auth-header",
    "regex": "\\bcurl\\b(?:.*?|.*?(?:[\\r\\n]{1,2}.*?){1,5})[ \\t\\n\\r](?:-H|--header)(?:=|[ \\t]{0,5})(?:\"(?i)(?:Authorization:[ \\t]{0,5}(?:Basic[ \\t]([a-z0-9+/]{8,}={0,3})|(?:Bearer|(?:Api-)?Token)[ \\t]([\\w=~@.+/-]{8,})|([\\w=~@.+/-]{8,}))|(?:(?:X-(?:[a-z]+-)?)?(?:Api-?)?(?:Key|Token)):[ \\t]{0,5}([\\w=~@.+/-]{8,}))\"|'(?i)(?:Authorization:[ \\t]{0,5}(?:Basic[ \\t]([a-z0-9+/]{8,}={0,3})|(?:Bearer|(?:Api-)?Token)[ \\t]([\\w=~@.+/-]{8,})|([\\w=~@.+/-]{8,}))|(?:(?:X-(?:[a-z]+-)?)?(?:Api-?)?(?:Key|Token)):[ \\t]{0,5}([\\w=~@.+/-]{8,}))')(?:\\B|\\s|\\z)",
    "keywords": [
      "curl"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.75,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "curl-auth-user",
    "regex": "\\bcurl\\b(?:.*|.*(?:[\\r\\n]{1,2}.*){1,5})[ \\t\\n\\r](?:-u|--user)(?:=|[ \\t]{0,5})(\"(:[^\"]{3,}|[^:\"]{3,}:|[^:\"]{3,}:[^\"]{3,})\"|'([^:']{3,}:[^']{3,})'|((?:\"[^\"]{3,}\"|'[^']{3,}'|[\\w$@.-]+):(?:\"[^\"]{3,}\"|'[^']{3,}'|[\\w${}@.-]+)))(?:\\s|\\z)",
    "keywords": [
      "curl"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "[^:]+:(?:change(?:it|me)|pass(?:word)?|pwd|test|token|\\*+|x+)",
          "['\"]?<[^>]+>['\"]?:['\"]?<[^>]+>|<[^:]+:[^>]+>['\"]?",
          "[^:]+:\\[[^]]+]",
          "['\"]?[^:]+['\"]?:['\"]?\\$(?:\\d|\\w+|\\{(?:\\d|\\w+)})['\"]?",
          "['\"]?\\$\\{(?:[^{}]|\\{[^}]*\\})*\\}['\"]?:['\"]?\\$\\{(?:[^{}]|\\{[^}]*\\})*\\}['\"]?",
          "\\$\\([^)]+\\):\\$\\([^)]+\\)",
          "['\"]?\\$?{{[^}]+}}['\"]?:['\"]?\\$?{{[^}]+}}['\"]?"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "cursor-api-key",
    "regex": "(?i)(?:cursor)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(key_[0-9a-f]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cursor"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "databento-api-key",
    "regex": "(?i)(?:databento)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(db-[A-Za-z0-9]{29})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "databento"
    ]
  },
  {
    "id": "databricks-api-token",
    "regex": "\\b(dapi[a-f0-9]{32}(?:-\\d)?)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dapi"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "datadog-api-key",
    "regex": "(?i)(?:datadog)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "datadog"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "datadog-application-key",
    "regex": "(?i)(?:datadog)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "datadog"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "datagov-api-key",
    "regex": "(?i)(?:data\\.gov)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "data.gov"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "datastax-astra-application-token",
    "regex": "\\b(AstraCS:[A-Za-z0-9]{20,})",
    "keywords": [
      "astracs:"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "deepgram-api-key",
    "regex": "(?i)(?:deepgram)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "deepgram"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "deepseek-api-key",
    "regex": "(?i)(?:deepseek)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk-[a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "deepseek"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "defined-networking-api-token",
    "regex": "(?i)(?:dnkey)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(dnkey-[a-z0-9=_\\-]{26}-[a-z0-9=_\\-]{52})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dnkey"
    ]
  },
  {
    "id": "deno-account-token",
    "regex": "\\b(ddp_[A-Za-z0-9]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ddp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devcycle-client-sdk-key",
    "regex": "\\b(dvc_client_[A-Za-z0-9]{8,32})",
    "keywords": [
      "dvc_client_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devcycle-mobile-sdk-key",
    "regex": "\\b(dvc_mobile_[A-Za-z0-9]{8,32})",
    "keywords": [
      "dvc_mobile_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devcycle-server-sdk-key",
    "regex": "\\b(dvc_server_[A-Za-z0-9]{8,32})",
    "keywords": [
      "dvc_server_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devin-personal-api-key",
    "regex": "\\b(apk_user_[A-Za-z0-9+/]{120,180}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "apk_user_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devin-service-api-key",
    "regex": "\\b(apk_[A-Za-z0-9+/]{80,100}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "apk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "devin-service-user-token",
    "regex": "\\b(cog_[a-z2-7]{52})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "cog_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "digitalocean-access-token",
    "regex": "\\b(doo_v1_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "doo_v1_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "digitalocean-pat",
    "regex": "\\b(dop_v1_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dop_v1_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "digitalocean-refresh-token",
    "regex": "(?i)\\b(dor_v1_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dor_v1_"
    ]
  },
  {
    "id": "discord-api-token",
    "regex": "(?i)(?:discord)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "discord"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "discord-client-id",
    "regex": "(?i)(?:discord)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9]{18})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "discord"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.75,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "discord-client-secret",
    "regex": "(?i)(?:discord)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "discord"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "disqus-api-key",
    "regex": "(?i)(?:disqus)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "disqus"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "docker-swarm-join-token",
    "regex": "\\b(SWMTKN-1-[a-z0-9]{50,60}-[a-z0-9]{24,30})",
    "keywords": [
      "swmtkn-1-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "docker-swarm-unlock-key",
    "regex": "\\b(SWMKEY-1-[A-Za-z0-9+/]{40,50})",
    "keywords": [
      "swmkey-1-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "dockerhub-organization-access-token",
    "regex": "\\b(dckr_oat_[A-Za-z0-9_-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dckr_oat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "dockerhub-personal-access-token",
    "regex": "\\b(dckr_pat_[A-Za-z0-9_-]{27})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dckr_pat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "doppler-api-token",
    "regex": "dp\\.pt\\.(?i)[a-z0-9]{43}",
    "keywords": [
      "dp.pt."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "droneci-access-token",
    "regex": "(?i)(?:droneci)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "droneci"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "dropbox-api-token",
    "regex": "(?i)(?:dropbox)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{15})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dropbox"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "dropbox-long-lived-api-token",
    "regex": "(?i)(?:dropbox)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{11}(AAAAAAAAAA)[a-z0-9\\-_=]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dropbox"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "dropbox-short-lived-api-token",
    "regex": "(?i)(?:dropbox)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sl\\.[a-z0-9\\-=_]{135})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "dropbox"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "duffel-api-token",
    "regex": "duffel_(?:test|live)_(?i)[a-z0-9_\\-=]{43}",
    "keywords": [
      "duffel_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "dynatrace-api-token",
    "regex": "dt0c01\\.(?i)[a-z0-9]{24}\\.[a-z0-9]{64}",
    "keywords": [
      "dt0c01."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "easypost-api-token",
    "regex": "\\bEZAK(?i)[a-z0-9]{54}\\b",
    "keywords": [
      "ezak"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "easypost-test-api-token",
    "regex": "\\bEZTK(?i)[a-z0-9]{54}\\b",
    "keywords": [
      "eztk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "ebay-client-id",
    "regex": "\\b([a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+-PRD-[a-f0-9]{8,12}-[a-f0-9]{8,12})",
    "keywords": [
      "-prd-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "ebay-client-secret",
    "regex": "(?i:(?:ebay(?:[_. -]*(?:client|api))?[_. -]*(?:secret|key))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(PRD-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4,12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ebay"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "components": [
      "ebay-client-id"
    ]
  },
  {
    "id": "elastic-cloud-api-key",
    "regex": "\\b(essu_[A-Za-z0-9_\\-]{60,200}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "essu_"
    ]
  },
  {
    "id": "elevenlabs-api-key",
    "regex": "(?i)(?:elevenlabs)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk_[0-9a-f]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "elevenlabs"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "endorlabs-api-key",
    "regex": "(?i)(?:endor(?:labs)?|key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(endr\\+[A-Za-z0-9-]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "endr+"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "endorlabs-api-secret",
    "regex": "(?i)(?:endor(?:labs)?|secret)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(endr\\+[A-Za-z0-9-]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "endr+"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "etsy-open-api-key",
    "regex": "(?i)(?:etsy|x-api-key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{24}:[a-z0-9]{10,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "etsy",
      "x-api-key"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "exoscale-api-key",
    "regex": "\\b(EXO[a-zA-Z0-9]{24,30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "exo"
    ],
    "components": [
      "exoscale-api-secret"
    ]
  },
  {
    "id": "exoscale-api-secret",
    "regex": "(?i)(?:exoscale)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_\\-]{40,60})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "exoscale"
    ],
    "skipReport": true
  },
  {
    "id": "facebook-access-token",
    "regex": "(?i)\\b(\\d{15,16}(\\||%)[0-9a-z\\-_]{27,40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "facebook"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "facebook-page-access-token",
    "regex": "\\b(EAA[MC](?i)[a-z0-9]{100,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "eaam",
      "eaac"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "facebook-secret",
    "regex": "(?i)(?:facebook)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "facebook"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "fal-api-key.1",
    "regex": "(?i:(?:falai|fal_ai|fal-ai|fal.ai|fal-api|fal_api|fal_key|fal-key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "falai",
      "fal_ai",
      "fal-ai",
      "fal.ai",
      "fal-api",
      "fal_api",
      "fal_key",
      "fal-key"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "fastly-api-token",
    "regex": "(?i)(?:fastly)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "fastly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "figma-personal-access-header-token",
    "regex": "(?i)(?:x-figma-token|xfigmatoken|x_figma_token)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9A-F]{4}-[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "x-figma-token",
      "xfigmatoken",
      "x_figma_token"
    ]
  },
  {
    "id": "figma-personal-access-token",
    "regex": "(?i)\\b(figd_[A-Z0-9_-]{38,42})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "figd_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "finicity-api-token",
    "regex": "(?i)(?:finicity)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "finicity"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "finicity-client-secret",
    "regex": "(?i)(?:finicity)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "finicity"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "finnhub-access-token",
    "regex": "(?i)(?:finnhub)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "finnhub"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "flickr-access-token",
    "regex": "(?i)(?:flickr)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "flickr"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "flutterwave-encryption-key",
    "regex": "FLWSECK_TEST-(?i)[a-h0-9]{12}",
    "keywords": [
      "flwseck_test"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "flutterwave-public-key",
    "regex": "FLWPUBK_TEST-(?i)[a-h0-9]{32}-X",
    "keywords": [
      "flwpubk_test"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "flutterwave-secret-key",
    "regex": "FLWSECK_TEST-(?i)[a-h0-9]{32}-X",
    "keywords": [
      "flwseck_test"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "flyio-access-token",
    "regex": "\\b(FlyV1\\s[A-Za-z0-9=_\\-,/+]{100,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "flyv1"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "frameio-api-token",
    "regex": "fio-u-(?i)[a-z0-9\\-_=]{64}",
    "keywords": [
      "fio-u-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "freshbooks-access-token",
    "regex": "(?i)(?:freshbooks)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "freshbooks"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "fullstory-api-key",
    "regex": "(?i)(?:(?:fullstory|fs_api|fullstory_api))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:na1|eu1)\\.[A-Za-z0-9]{20,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "fullstory",
      "fs_api"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "gcp-api-key",
    "regex": "\\b(AIza[\\w-]{35})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "aiza"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "AIzaSyabcdefghijklmnopqrstuvwxyz1234567",
          "AIzaSyAnLA7NfeLquW1tJFpx_eQCxoX-oo6YyIs",
          "AIzaSyCkEhVjf3pduRDt6d1yKOMitrUEke8agEM",
          "AIzaSyDMAScliyLx7F0NPDEJi1QmyCgHIAODrlU",
          "AIzaSyD3asb-2pEZVqMkmL6M9N6nHZRR_znhrh0",
          "AIzayDNSXIbFmlXbIE6mCzDLQAqITYefhixbX4A",
          "AIzaSyAdOS2zB6NCsk1pCdZ4-P6GBdi_UUPwX7c",
          "AIzaSyASWm6HmTMdYWpgMnjRBjxcQ9CKctWmLd4",
          "AIzaSyANUvH9H9BsUccjsu2pCmEkOPjjaXeDQgY",
          "AIzaSyA5_iVawFQ8ABuTZNUdcwERLJv_a_p4wtM",
          "AIzaSyA4UrcGxgwQFTfaI3no3t7Lt1sjmdnP5sQ",
          "AIzaSyDSb51JiIcB6OJpwwMicseKRhhrOq1cS7g",
          "AIzaSyBF2RrAIm4a0mO64EShQfqfd2AFnzAvvuU",
          "AIzaSyBcE-OOIbhjyR83gm4r2MFCu4MJmprNXsw",
          "AIzaSyB8qGxt4ec15vitgn44duC5ucxaOi4FmqE",
          "AIzaSyA8vmApnrHNFE0bApF4hoZ11srVL_n0nvY"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "gcp-application-default-credentials",
    "regex": "\\{[^{]+(?:(?:\"client_secret\"\\s*:\\s*\"[^\"]+\"[^}]+\"refresh_token\"\\s*:\\s*\"[^\"]+\")|(?:\"refresh_token\"\\s*:\\s*\"[^\"]+\"[^}]+\"client_secret\"\\s*:\\s*\"[^\"]+\"))[^}]+\\}",
    "keywords": [
      ".apps.googleusercontent.com"
    ]
  },
  {
    "id": "gcp-gemini-api",
    "regex": "\\b(AQ\\.Ab8RN6[A-Za-z0-9_-]{44})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "aq.ab8rn6"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gcp-service-account",
    "regex": "\\{[^{]+(?:(?:\"private_key\"\\s*:\\s*\"-----BEGIN (?:RSA )?PRIVATE KEY-----[^}]+auth_provider_x509_cert_url)|(?:auth_provider_x509_cert_url[^}]+\"private_key\"\\s*:\\s*\"-----BEGIN (?:RSA )?PRIVATE KEY-----))[^}]+\\}",
    "keywords": [
      "provider_x509"
    ],
    "filter": [
      {
        "kind": "contains",
        "target": "secret",
        "values": [
          "image-pulling@authenticated-image-pulling.iam.gserviceaccount.com"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "generic-api-key",
    "regex": "(?i)(?:access|auth|(?-i:[Aa]pi|API)|credential|creds|key|secret|token)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([\\w.=-]{10,150}|[a-z0-9][a-z0-9+/]{11,}={0,3})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "access",
      "api",
      "auth",
      "key",
      "credential",
      "creds",
      "secret",
      "token"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^[a-zA-Z_.-]+$"
        ],
        "isNegated": false
      },
      {
        "kind": "contains",
        "target": "secret",
        "values": [
          "000000",
          "aaaaaa",
          "about",
          "abstract",
          "academy",
          "acces",
          "account",
          "act-",
          "act.",
          "act_",
          "action",
          "active",
          "actively",
          "activity",
          "adapter",
          "add-",
          "add.",
          "add_",
          "add-on",
          "addon",
          "addres",
          "admin",
          "adobe",
          "advanced",
          "adventure",
          "agent",
          "agile",
          "air-",
          "air.",
          "air_",
          "ajax",
          "akka",
          "alert",
          "alfred",
          "algorithm",
          "all-",
          "all.",
          "all_",
          "alloy",
          "alpha",
          "amazon",
          "amqp",
          "analysi",
          "analytic",
          "analyzer",
          "android",
          "angular",
          "angularj",
          "animate",
          "animation",
          "another",
          "ansible",
          "answer",
          "ant-",
          "ant.",
          "ant_",
          "any-",
          "any.",
          "any_",
          "apache",
          "app-",
          "app.",
          "app_",
          "apple",
          "arch",
          "archive",
          "archived",
          "arduino",
          "array",
          "art-",
          "art.",
          "art_",
          "article",
          "asp-",
          "asp.",
          "asp_",
          "asset",
          "async",
          "atom",
          "attention",
          "audio",
          "audit",
          "aura",
          "auth",
          "author",
          "authorize",
          "auto",
          "automated",
          "automatic",
          "awesome",
          "aws_",
          "azure",
          "back",
          "backbone",
          "backend",
          "backup",
          "bar-",
          "bar.",
          "bar_",
          "base",
          "based",
          "bash",
          "basic",
          "batch",
          "been",
          "beer",
          "behavior",
          "being",
          "benchmark",
          "best",
          "beta",
          "better",
          "big-",
          "big.",
          "big_",
          "binary",
          "binding",
          "bit-",
          "bit.",
          "bit_",
          "bitcoin",
          "block",
          "blog",
          "board",
          "book",
          "bookmark",
          "boost",
          "boot",
          "bootstrap",
          "bosh",
          "bot-",
          "bot.",
          "bot_",
          "bower",
          "box-",
          "box.",
          "box_",
          "boxen",
          "bracket",
          "branch",
          "bridge",
          "browser",
          "brunch",
          "buffer",
          "bug-",
          "bug.",
          "bug_",
          "build",
          "builder",
          "building",
          "buildout",
          "buildpack",
          "built",
          "bundle",
          "busines",
          "but-",
          "but.",
          "but_",
          "button",
          "cache",
          "caching",
          "cakephp",
          "calendar",
          "call",
          "camera",
          "campfire",
          "can-",
          "can.",
          "can_",
          "canva",
          "captcha",
          "capture",
          "card",
          "carousel",
          "case",
          "cassandra",
          "cat-",
          "cat.",
          "cat_",
          "category",
          "center",
          "cento",
          "challenge",
          "change",
          "changelog",
          "channel",
          "chart",
          "chat",
          "cheat",
          "check",
          "checker",
          "chef",
          "ches",
          "chinese",
          "chosen",
          "chrome",
          "ckeditor",
          "clas",
          "classe",
          "classic",
          "clean",
          "cli-",
          "cli.",
          "cli_",
          "client",
          "clojure",
          "clone",
          "closure",
          "cloud",
          "club",
          "cluster",
          "cms-",
          "cms_",
          "coco",
          "code",
          "coding",
          "coffee",
          "color",
          "combination",
          "combo",
          "command",
          "commander",
          "comment",
          "commit",
          "common",
          "community",
          "compas",
          "compiler",
          "complete",
          "component",
          "composer",
          "computer",
          "computing",
          "con-",
          "con.",
          "con_",
          "concept",
          "conf",
          "config",
          "connect",
          "connector",
          "console",
          "contact",
          "container",
          "contao",
          "content",
          "contest",
          "context",
          "control",
          "convert",
          "converter",
          "conway'",
          "cookbook",
          "cookie",
          "cool",
          "copy",
          "cordova",
          "core",
          "couchbase",
          "couchdb",
          "countdown",
          "counter",
          "course",
          "craft",
          "crawler",
          "create",
          "creating",
          "creator",
          "credential",
          "crm-",
          "crm.",
          "crm_",
          "cros",
          "crud",
          "csv-",
          "csv.",
          "csv_",
          "cube",
          "cucumber",
          "cuda",
          "current",
          "currently",
          "custom",
          "daemon",
          "dark",
          "dart",
          "dash",
          "dashboard",
          "data",
          "database",
          "date",
          "day-",
          "day.",
          "day_",
          "dead",
          "debian",
          "debug",
          "debugger",
          "deck",
          "define",
          "del-",
          "del.",
          "del_",
          "delete",
          "demo",
          "deploy",
          "design",
          "designer",
          "desktop",
          "detection",
          "detector",
          "dev-",
          "dev.",
          "dev_",
          "develop",
          "developer",
          "device",
          "devise",
          "diff",
          "digital",
          "directive",
          "directory",
          "discovery",
          "display",
          "django",
          "dns-",
          "dns_",
          "doc-",
          "doc.",
          "doc_",
          "docker",
          "docpad",
          "doctrine",
          "document",
          "doe-",
          "doe.",
          "doe_",
          "dojo",
          "dom-",
          "dom.",
          "dom_",
          "domain",
          "done",
          "don't",
          "dot-",
          "dot.",
          "dot_",
          "dotfile",
          "download",
          "draft",
          "drag",
          "drill",
          "drive",
          "driven",
          "driver",
          "drop",
          "dropbox",
          "drupal",
          "dsl-",
          "dsl.",
          "dsl_",
          "dynamic",
          "easy",
          "_ec2_",
          "ecdsa",
          "eclipse",
          "edit",
          "editing",
          "edition",
          "editor",
          "element",
          "emac",
          "email",
          "embed",
          "embedded",
          "ember",
          "emitter",
          "emulator",
          "encoding",
          "endpoint",
          "engine",
          "english",
          "enhanced",
          "entity",
          "entry",
          "env_",
          "episode",
          "erlang",
          "error",
          "espresso",
          "event",
          "evented",
          "example",
          "exchange",
          "exercise",
          "experiment",
          "expire",
          "exploit",
          "explorer",
          "export",
          "exporter",
          "expres",
          "ext-",
          "ext.",
          "ext_",
          "extended",
          "extension",
          "external",
          "extra",
          "extractor",
          "fabric",
          "facebook",
          "factory",
          "fake",
          "fast",
          "feature",
          "feed",
          "fewfwef",
          "ffmpeg",
          "field",
          "file",
          "filter",
          "find",
          "finder",
          "firefox",
          "firmware",
          "first",
          "fish",
          "fix-",
          "fix_",
          "flash",
          "flask",
          "flat",
          "flex",
          "flexible",
          "flickr",
          "flow",
          "fluent",
          "fluentd",
          "fluid",
          "folder",
          "font",
          "force",
          "foreman",
          "fork",
          "form",
          "format",
          "formatter",
          "forum",
          "foundry",
          "framework",
          "free",
          "friend",
          "friendly",
          "front-end",
          "frontend",
          "ftp-",
          "ftp.",
          "ftp_",
          "fuel",
          "full",
          "fun-",
          "fun.",
          "fun_",
          "func",
          "future",
          "gaia",
          "gallery",
          "game",
          "gateway",
          "gem-",
          "gem.",
          "gem_",
          "gen-",
          "gen.",
          "gen_",
          "general",
          "generator",
          "generic",
          "genetic",
          "get-",
          "get.",
          "get_",
          "getenv",
          "getting",
          "ghost",
          "gist",
          "git-",
          "git.",
          "git_",
          "github",
          "gitignore",
          "gitlab",
          "glas",
          "gmail",
          "gnome",
          "gnu-",
          "gnu.",
          "gnu_",
          "goal",
          "golang",
          "gollum",
          "good",
          "google",
          "gpu-",
          "gpu.",
          "gpu_",
          "gradle",
          "grail",
          "graph",
          "graphic",
          "great",
          "grid",
          "groovy",
          "group",
          "grunt",
          "guard",
          "gui-",
          "gui.",
          "gui_",
          "guide",
          "guideline",
          "gulp",
          "gwt-",
          "gwt.",
          "gwt_",
          "hack",
          "hackathon",
          "hacker",
          "hacking",
          "hadoop",
          "haml",
          "handler",
          "hardware",
          "has-",
          "has_",
          "hash",
          "haskell",
          "have",
          "haxe",
          "hello",
          "help",
          "helper",
          "here",
          "hero",
          "heroku",
          "high",
          "hipchat",
          "history",
          "home",
          "homebrew",
          "homepage",
          "hook",
          "host",
          "hosting",
          "hot-",
          "hot.",
          "hot_",
          "house",
          "how-",
          "how.",
          "how_",
          "html",
          "http",
          "hub-",
          "hub.",
          "hub_",
          "hubot",
          "human",
          "icon",
          "ide-",
          "ide.",
          "ide_",
          "idea",
          "identity",
          "idiomatic",
          "image",
          "impact",
          "import",
          "important",
          "importer",
          "impres",
          "index",
          "infinite",
          "info",
          "injection",
          "inline",
          "input",
          "inside",
          "inspector",
          "instagram",
          "install",
          "installer",
          "instant",
          "intellij",
          "interface",
          "internet",
          "interview",
          "into",
          "intro",
          "ionic",
          "iphone",
          "ipython",
          "irc-",
          "irc_",
          "iso-",
          "iso.",
          "iso_",
          "issue",
          "jade",
          "jasmine",
          "java",
          "jbos",
          "jekyll",
          "jenkin",
          "jetbrains",
          "job-",
          "job.",
          "job_",
          "joomla",
          "jpa-",
          "jpa.",
          "jpa_",
          "jquery",
          "json",
          "just",
          "kafka",
          "karma",
          "kata",
          "kernel",
          "keyboard",
          "kindle",
          "kit-",
          "kit.",
          "kit_",
          "kitchen",
          "knife",
          "koan",
          "kohana",
          "lab-",
          "lab.",
          "lab_",
          "lambda",
          "lamp",
          "language",
          "laravel",
          "last",
          "latest",
          "latex",
          "launcher",
          "layer",
          "layout",
          "lazy",
          "ldap",
          "leaflet",
          "league",
          "learn",
          "learning",
          "led-",
          "led.",
          "led_",
          "leetcode",
          "les-",
          "les.",
          "les_",
          "level",
          "leveldb",
          "lib-",
          "lib.",
          "lib_",
          "librarie",
          "library",
          "license",
          "life",
          "liferay",
          "light",
          "lightbox",
          "like",
          "line",
          "link",
          "linked",
          "linkedin",
          "linux",
          "lisp",
          "list",
          "lite",
          "little",
          "load",
          "loader",
          "local",
          "location",
          "lock",
          "log-",
          "log.",
          "log_",
          "logger",
          "logging",
          "logic",
          "login",
          "logstash",
          "longer",
          "look",
          "love",
          "lua-",
          "lua.",
          "lua_",
          "mac-",
          "mac.",
          "mac_",
          "machine",
          "made",
          "magento",
          "magic",
          "mail",
          "make",
          "maker",
          "making",
          "man-",
          "man.",
          "man_",
          "manage",
          "manager",
          "manifest",
          "manual",
          "map-",
          "map.",
          "map_",
          "mapper",
          "mapping",
          "markdown",
          "markup",
          "master",
          "math",
          "matrix",
          "maven",
          "md5",
          "mean",
          "media",
          "mediawiki",
          "meetup",
          "memcached",
          "memory",
          "menu",
          "merchant",
          "message",
          "messaging",
          "meta",
          "metadata",
          "meteor",
          "method",
          "metric",
          "micro",
          "middleman",
          "migration",
          "minecraft",
          "miner",
          "mini",
          "minimal",
          "mirror",
          "mit-",
          "mit.",
          "mit_",
          "mobile",
          "mocha",
          "mock",
          "mod-",
          "mod.",
          "mod_",
          "mode",
          "model",
          "modern",
          "modular",
          "module",
          "modx",
          "money",
          "mongo",
          "mongodb",
          "mongoid",
          "mongoose",
          "monitor",
          "monkey",
          "more",
          "motion",
          "moved",
          "movie",
          "mozilla",
          "mqtt",
          "mule",
          "multi",
          "multiple",
          "music",
          "mustache",
          "mvc-",
          "mvc.",
          "mvc_",
          "mysql",
          "nagio",
          "name",
          "native",
          "need",
          "neo-",
          "neo.",
          "neo_",
          "nest",
          "nested",
          "net-",
          "net.",
          "net_",
          "nette",
          "network",
          "new-",
          "new.",
          "new_",
          "next",
          "nginx",
          "ninja",
          "nlp-",
          "nlp.",
          "nlp_",
          "node",
          "nodej",
          "nosql",
          "not-",
          "not.",
          "not_",
          "note",
          "notebook",
          "notepad",
          "notice",
          "notifier",
          "now-",
          "now.",
          "now_",
          "number",
          "oauth",
          "object",
          "objective",
          "obsolete",
          "ocaml",
          "octopres",
          "official",
          "old-",
          "old.",
          "old_",
          "onboard",
          "online",
          "only",
          "open",
          "opencv",
          "opengl",
          "openshift",
          "openwrt",
          "option",
          "oracle",
          "org-",
          "org.",
          "org_",
          "origin",
          "original",
          "orm-",
          "orm.",
          "orm_",
          "osx-",
          "osx_",
          "our-",
          "our.",
          "our_",
          "out-",
          "out.",
          "out_",
          "output",
          "over",
          "overview",
          "own-",
          "own.",
          "own_",
          "pack",
          "package",
          "packet",
          "page",
          "panel",
          "paper",
          "paperclip",
          "para",
          "parallax",
          "parallel",
          "parse",
          "parser",
          "parsing",
          "particle",
          "party",
          "password",
          "patch",
          "path",
          "pattern",
          "payment",
          "paypal",
          "pdf-",
          "pdf.",
          "pdf_",
          "pebble",
          "people",
          "perl",
          "personal",
          "phalcon",
          "phoenix",
          "phone",
          "phonegap",
          "photo",
          "php-",
          "php.",
          "php_",
          "physic",
          "picker",
          "pipeline",
          "platform",
          "play",
          "player",
          "please",
          "plu-",
          "plu.",
          "plu_",
          "plug-in",
          "plugin",
          "plupload",
          "png-",
          "png.",
          "png_",
          "poker",
          "polyfill",
          "polymer",
          "pool",
          "pop-",
          "pop.",
          "pop_",
          "popcorn",
          "popup",
          "port",
          "portable",
          "portal",
          "portfolio",
          "post",
          "power",
          "powered",
          "powerful",
          "prelude",
          "pretty",
          "preview",
          "principle",
          "print",
          "pro-",
          "pro.",
          "pro_",
          "problem",
          "proc",
          "product",
          "profile",
          "profiler",
          "program",
          "progres",
          "project",
          "protocol",
          "prototype",
          "provider",
          "proxy",
          "public",
          "pull",
          "puppet",
          "pure",
          "purpose",
          "push",
          "pusher",
          "pyramid",
          "python",
          "quality",
          "query",
          "queue",
          "quick",
          "rabbitmq",
          "rack",
          "radio",
          "rail",
          "railscast",
          "random",
          "range",
          "raspberry",
          "rdf-",
          "rdf.",
          "rdf_",
          "react",
          "reactive",
          "read",
          "reader",
          "readme",
          "ready",
          "real",
          "reality",
          "real-time",
          "realtime",
          "recipe",
          "recorder",
          "red-",
          "red.",
          "red_",
          "reddit",
          "redi",
          "redmine",
          "reference",
          "refinery",
          "refresh",
          "registry",
          "related",
          "release",
          "remote",
          "rendering",
          "repo",
          "report",
          "request",
          "require",
          "required",
          "requirej",
          "research",
          "resource",
          "response",
          "resque",
          "rest",
          "restful",
          "resume",
          "reveal",
          "reverse",
          "review",
          "riak",
          "rich",
          "right",
          "ring",
          "robot",
          "role",
          "room",
          "router",
          "routing",
          "rpc-",
          "rpc.",
          "rpc_",
          "rpg-",
          "rpg.",
          "rpg_",
          "rspec",
          "ruby-",
          "ruby.",
          "ruby_",
          "rule",
          "run-",
          "run.",
          "run_",
          "runner",
          "running",
          "runtime",
          "rust",
          "rvm-",
          "rvm.",
          "rvm_",
          "salt",
          "sample",
          "sandbox",
          "sas-",
          "sas.",
          "sas_",
          "sbt-",
          "sbt.",
          "sbt_",
          "scala",
          "scalable",
          "scanner",
          "schema",
          "scheme",
          "school",
          "science",
          "scraper",
          "scratch",
          "screen",
          "script",
          "scroll",
          "scs-",
          "scs.",
          "scs_",
          "sdk-",
          "sdk.",
          "sdk_",
          "sdl-",
          "sdl.",
          "sdl_",
          "search",
          "secure",
          "security",
          "see-",
          "see.",
          "see_",
          "seed",
          "select",
          "selector",
          "selenium",
          "semantic",
          "sencha",
          "send",
          "sentiment",
          "serie",
          "server",
          "service",
          "session",
          "set-",
          "set.",
          "set_",
          "setting",
          "setup",
          "sha1",
          "sha2",
          "sha256",
          "share",
          "shared",
          "sharing",
          "sheet",
          "shell",
          "shield",
          "shipping",
          "shop",
          "shopify",
          "shortener",
          "should",
          "show",
          "showcase",
          "side",
          "silex",
          "simple",
          "simulator",
          "single",
          "site",
          "skeleton",
          "sketch",
          "skin",
          "slack",
          "slide",
          "slider",
          "slim",
          "small",
          "smart",
          "smtp",
          "snake",
          "snapshot",
          "snippet",
          "soap",
          "social",
          "socket",
          "software",
          "solarized",
          "solr",
          "solution",
          "solver",
          "some",
          "soon",
          "source",
          "space",
          "spark",
          "spatial",
          "spec",
          "sphinx",
          "spine",
          "spotify",
          "spree",
          "spring",
          "sprite",
          "sql-",
          "sql.",
          "sql_",
          "sqlite",
          "ssh-",
          "ssh.",
          "ssh_",
          "stack",
          "staging",
          "standard",
          "stanford",
          "start",
          "started",
          "starter",
          "startup",
          "stat",
          "statamic",
          "state",
          "static",
          "statistic",
          "statsd",
          "statu",
          "steam",
          "step",
          "still",
          "stm-",
          "stm.",
          "stm_",
          "storage",
          "store",
          "storm",
          "story",
          "strategy",
          "stream",
          "streaming",
          "string",
          "stripe",
          "structure",
          "studio",
          "study",
          "stuff",
          "style",
          "sublime",
          "sugar",
          "suite",
          "summary",
          "super",
          "support",
          "supported",
          "svg-",
          "svg.",
          "svg_",
          "svn-",
          "svn.",
          "svn_",
          "swagger",
          "swift",
          "switch",
          "switcher",
          "symfony",
          "symphony",
          "sync",
          "synopsi",
          "syntax",
          "system",
          "tab-",
          "tab.",
          "tab_",
          "table",
          "tag-",
          "tag.",
          "tag_",
          "talk",
          "target",
          "task",
          "tcp-",
          "tcp.",
          "tcp_",
          "tdd-",
          "tdd.",
          "tdd_",
          "team",
          "tech",
          "template",
          "term",
          "terminal",
          "testing",
          "tetri",
          "text",
          "textmate",
          "theme",
          "theory",
          "three",
          "thrift",
          "time",
          "timeline",
          "timer",
          "tiny",
          "tinymce",
          "tip-",
          "tip.",
          "tip_",
          "title",
          "todo",
          "todomvc",
          "token",
          "tool",
          "toolbox",
          "toolkit",
          "top-",
          "top.",
          "top_",
          "tornado",
          "touch",
          "tower",
          "tracker",
          "tracking",
          "traffic",
          "training",
          "transfer",
          "translate",
          "transport",
          "tree",
          "trello",
          "try-",
          "try.",
          "try_",
          "tumblr",
          "tut-",
          "tut.",
          "tut_",
          "tutorial",
          "tweet",
          "twig",
          "twitter",
          "type",
          "typo",
          "ubuntu",
          "uiview",
          "ultimate",
          "under",
          "unit",
          "unity",
          "universal",
          "unix",
          "update",
          "updated",
          "upgrade",
          "upload",
          "uploader",
          "uri-",
          "uri.",
          "uri_",
          "url-",
          "url.",
          "url_",
          "usage",
          "usb-",
          "usb.",
          "usb_",
          "use-",
          "use.",
          "use_",
          "used",
          "useful",
          "user",
          "using",
          "util",
          "utilitie",
          "utility",
          "vagrant",
          "validator",
          "value",
          "variou",
          "varnish",
          "version",
          "via-",
          "via.",
          "via_",
          "video",
          "view",
          "viewer",
          "vim-",
          "vim.",
          "vim_",
          "vimrc",
          "virtual",
          "vision",
          "visual",
          "vpn",
          "want",
          "warning",
          "watch",
          "watcher",
          "wave",
          "way-",
          "way.",
          "way_",
          "weather",
          "web-",
          "web_",
          "webapp",
          "webgl",
          "webhook",
          "webkit",
          "webrtc",
          "website",
          "websocket",
          "welcome",
          "what",
          "what'",
          "when",
          "where",
          "which",
          "why-",
          "why.",
          "why_",
          "widget",
          "wifi",
          "wiki",
          "win-",
          "win.",
          "win_",
          "window",
          "wip-",
          "wip.",
          "wip_",
          "within",
          "without",
          "wizard",
          "word",
          "wordpres",
          "work",
          "worker",
          "workflow",
          "working",
          "workshop",
          "world",
          "wrapper",
          "write",
          "writer",
          "writing",
          "written",
          "www-",
          "www.",
          "www_",
          "xamarin",
          "xcode",
          "xml-",
          "xml.",
          "xml_",
          "xmpp",
          "xxxxxx",
          "yahoo",
          "yaml",
          "yandex",
          "yeoman",
          "yet-",
          "yet.",
          "yet_",
          "yii-",
          "yii.",
          "yii_",
          "youtube",
          "yui-",
          "yui.",
          "yui_",
          "zend",
          "zero",
          "zip-",
          "zip.",
          "zip_",
          "zsh-",
          "zsh.",
          "zsh_",
          "6fe4476ee5a1832882e326b506d14126"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^sb_publishable_[A-Za-z0-9_-]{31}$",
          "^0x4AAAAAA[A-Za-z0-9_-]{15}$",
          "^FCM[a-zA-Z0-9]{13}$",
          "^ysc1_[A-Za-z0-9_-]{48}$",
          "^phc_[A-Za-z0-9_-]{43,44}$",
          "^APP_USR-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^access-(sandbox|development)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^asset-report-(sandbox|development)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^public-(sandbox|development|production)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^link-(sandbox|development)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^hbp_[0-9a-zA-Z]{36}$",
          "^woos-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^(https://)?[0-9a-zA-Z]{32}\\@sentry\\.io$",
          "^sub-c-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^pub-c-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^hc[a-z]ik_([a-z0-9]{26,58})$",
          "^mob-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^public-token-test-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^public-token-live-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          "^pdl_sdbx_apikey_[a-z\\d]{26}_[a-zA-Z\\d]{22}_[a-zA-Z\\d]{3}$",
          "^8c6803164dbc395fb7131c9d54843627$"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "generic-credential-uri",
    "regex": "(?i)\\b(?P<uri>(?P<scheme>https?|postgres(?:ql)?|mysql|mariadb|mongodb(?:\\+srv)?|rediss?|amqps?|ldaps?|smtps?|ftps?|ssh)://(?P<username>[^:/@\\s'\"\\x60]{0,128}):(?P<password>[^/@\\s'\"\\x60]{1,256})@(?P<host>(?:\\[[0-9a-f:.%]+\\]|[a-z0-9][a-z0-9._-]{0,252}))(?::[0-9]{1,5})?(?:,(?:\\[[0-9a-f:.%]+\\]|[a-z0-9][a-z0-9._-]{0,252})(?::[0-9]{1,5})?)*(?:[/?][a-z0-9._~!$&(*+,;=:@%/?-]*)?)(?:[\\s'\"\\x60#<>{}\\[\\],;)]|\\\\[nr]|$)",
    "keywords": [
      "http://",
      "https://",
      "postgres://",
      "postgresql://",
      "mysql://",
      "mariadb://",
      "mongodb://",
      "mongodb+srv://",
      "redis://",
      "rediss://",
      "amqp://",
      "amqps://",
      "ldap://",
      "ldaps://",
      "smtp://",
      "smtps://",
      "ftp://",
      "ftps://",
      "ssh://"
    ],
    "secretGroup": 4,
    "filter": [
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "(?i)^(?:[a-z0-9]+[_.-])?(?:your[_.-]?(?:password|passwd|pwd)|(?:password|passwd|pwd)[_.-]goes[_.-]?here|replace[_.-]?me|insert[_.-].*[_.-]here|placeholder)$"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "match",
        "patterns": [
          "(?i)^[a-z][a-z0-9+.-]*://(?:foo|user(?:name)?|example(?:[_.-]?user)?):(?:bar|pass(?:word)?|passwd|pwd|example(?:[_.-]?(?:password|passwd|pwd))?)@(?:(?:example|test)\\.(?:com|org|net)|example\\.invalid)(?::[0-9]{1,5})?(?:[/\\s'\"\\x60#]|$)"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "match",
        "patterns": [
          "(?i)^[a-z][a-z0-9+.-]*://[^@\\s]+@(?:[a-z0-9_-]+\\.)*example(?:\\.(?:com|org|net))?\\.?(?::[0-9]{1,5})?(?:,(?:[a-z0-9_-]+\\.)*example(?:\\.(?:com|org|net))?\\.?(?::[0-9]{1,5})?)*(?:[/?\\s'\"\\x60#<>{}\\[\\];)]|,?$)"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^\\*+$",
          "^\\.+$",
          "(?i)^x{4,}$",
          "^•+$",
          "(?i)^\\[?(?:redacted|masked|filtered)\\]?$",
          "^\\$\\{.*}$",
          "^\\$\\([^\\r\\n]+\\)$",
          "^#\\{[^}\\r\\n]+}$",
          "^\\{\\{[ \\t]*.+[ \\t]*}}$",
          "^%\\{[^}]+}$",
          "^\\$[A-Za-z_][A-Za-z0-9_]*$",
          "(?i)^\\$env:[A-Za-z_][A-Za-z0-9_]*$",
          "^%[A-Za-z_][A-Za-z0-9_]*%$",
          "^<[^>]+>$",
          "^\\[[A-Za-z_][A-Za-z0-9_.-]*]$",
          "^\\{[^}]+}$",
          "(?:\\$\\{|#\\{|\\{\\{|%\\{)"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "generic-password",
    "regex": "(?i)(?:(?:passw(?:or)?d|psw|[_.-]pw)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]{0,5}(?:\"((?:\\\\.|[^\"\\\\\\r\\n]){5,250})\"|'((?:\\\\.|[^'\\\\\\r\\n]){5,250})'|\\x60((?:\\\\.|[^\\x60\\\\\\r\\n]){5,250})\\x60|([^:=\\s'\"\\x60,;][^\\s'\"\\x60,;]{4,249}))(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]+(?:#|//|/\\*|--)|[ \\t]*$|\\\\[nr])|\\b(?:login|log_in|authenticate)\\b[ \\t]*\\([ \\t]*[^,()\\r\\n]{1,250}[ \\t]*,[ \\t]*(?:\"((?:\\\\.|[^\"\\\\\\r\\n]){4,250})\"|'((?:\\\\.|[^'\\\\\\r\\n]){4,250})'|\\x60((?:\\\\.|[^\\x60\\\\\\r\\n]){4,250})\\x60)[ \\t]*\\))",
    "keywords": [
      "passw",
      "psw",
      "_pw",
      "-pw",
      ".pw",
      "login(",
      "login (",
      "log_in(",
      "log_in (",
      "authenticate(",
      "authenticate ("
    ],
    "filter": [
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^\\*+$",
          "^\\.+$",
          "(?i)^x{4,}$",
          "(?i)^\\[?(?:redacted|masked|filtered)\\]?$",
          "^•+$",
          "^\\$\\{.*}$",
          "^\\$\\([^\\r\\n]+\\)$",
          "^#\\{[^}\\r\\n]+}$",
          "^\\{\\{[ \\t]*.+[ \\t]*}}$",
          "^%\\{[^}]+}$",
          "^\\$[A-Za-z_][A-Za-z0-9_]*$",
          "(?i)^\\$env:[A-Za-z_][A-Za-z0-9_]*$",
          "^%[A-Za-z_][A-Za-z0-9_]*%$",
          "^<[^>]+>$",
          "^<[^>\\s]+$",
          "^\\{[^}]+}$",
          "(?i)^(?:your[_-]?password|placeholder|forbidden_value)$",
          "^\\([A-Za-z_][A-Za-z0-9_.]*(?:[ \\t]+[A-Za-z_][A-Za-z0-9_.]*)*\\)$",
          "^\\$\\(",
          "(?:\\$\\{|#\\{|\\{\\{|%\\{)",
          "%\\([A-Za-z_][A-Za-z0-9_]*\\)[#0 +\\-]?[0-9.]*(?:[diouxXeEfFgGcrs%])",
          "(?i)^--?passw(?:or)?d$",
          "^\\$2[abxy]\\$[0-9]{2}\\$[./A-Za-z0-9]{7,}$",
          "(?i)^\\$pbkdf2[-_][^$]+\\$.*$",
          "(?i)^(?:pbkdf2_(?:sha1|sha256)|bcrypt_sha256|argon2|scrypt|sha1|md5|crypt)\\$",
          "(?i)^\\$(?:1|5|6|7|y|gy|argon2(?:d|i|id)|scrypt|pbkdf2(?:[-_]sha(?:1|224|256|384|512))?|apr1)\\$",
          "^\\$[PH]\\$[./A-Za-z0-9]{20,}$",
          "(?i)^\\{(?:SSHA(?:256|384|512)?|SHA(?:256|384|512)?|MD5|CRYPT|BCRYPT|PBKDF2)}",
          "(?i)^SCRAM-SHA-(?:1|256|512)\\$",
          "(?i)^md5[0-9a-f]{32}$",
          "^\\*[0-9A-F]{40}$"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "(?i)^ENC\\[[A-Z0-9][A-Z0-9_.+/-]*(?:,|\\]|$)",
          "(?i)^ENC\\([A-Z0-9+/=_:.,-]{8,}\\)$",
          "(?i)^\\{cipher\\}.{4,}$",
          "^\\$ANSIBLE_VAULT(?:;|$)",
          "(?i)^!vault$",
          "^age-encryption\\.org/v[0-9]+$",
          "^-----BEGIN (?:AGE ENCRYPTED FILE|PGP MESSAGE|ENCRYPTED PRIVATE KEY)-----$",
          "^U2FsdGVkX1[A-Za-z0-9+/=]{8,}$",
          "^vault:v[0-9]+:[A-Za-z0-9+/=_-]{8,}$",
          "^gAAAAA[A-Za-z0-9_-]{70,}={0,2}$",
          "^[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}$",
          "^v[124]\\.local\\.[A-Za-z0-9_-]{32,}(?:\\.[A-Za-z0-9_-]+)?$",
          "^AQAAANCMnd8BFdERjHoAwE/Cl\\+sBA[A-Za-z0-9+/=]{16,}$",
          "(?i)^01000000d08c9ddf0115d1118c7a00c04fc297eb01[0-9a-f]{16,}$"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "(?i)^(?:AES|RIJNDAEL|ARIA|CAMELLIA)[-_/]?(?:128|192|256)(?:[-_/](?:ECB|CBC(?:[-_/]HMAC[-_/]SHA[-_]?(?:256|384|512))?|PCBC|CFB(?:8|64|128)?|OFB(?:8|64|128)?|CTR|CTS|CCM|GCM|GMAC|EAX|OCB|SIV|GCM[-_]?SIV|XTS|KW|KWP))?$",
          "(?i)^(?:AES|RIJNDAEL|ARIA|CAMELLIA)[-_/]?(?:ECB|CBC|PCBC|CFB(?:8|64|128)?|OFB(?:8|64|128)?|CTR|CTS|CCM|GCM|GMAC|EAX|OCB|SIV|GCM[-_]?SIV|XTS|KW|KWP)$",
          "(?i)^(?:(?:RIJNDAEL|ARIA|CAMELLIA|DES(?:[-_]?(?:EDE3?|3|X))?|DESEDE|3DES|TRIPLE[-_]?DES|BLOWFISH|BF|TWOFISH|SERPENT|CAST(?:5|128|256)?|IDEA|SEED|SM4|RC[2456]|ARCFOUR)[-_/](?:ECB|CBC|PCBC|CFB(?:8|64|128)?|OFB(?:8|64|128)?|CTR|CTS|CCM|GCM|GMAC|EAX|OCB|SIV|GCM[-_]?SIV|XTS|KW|KWP)|X?(?:CHACHA20|SALSA20)[-_/]POLY1305|AESWRAP(?:[-_]?(?:128|192|256))?|DESEDEWRAP)$",
          "(?i)^(?:AES(?:[-_]?(?:128|192|256))?|ARIA(?:[-_]?(?:128|192|256))?|CAMELLIA(?:[-_]?(?:128|192|256))?|BLOWFISH|DES|DESEDE|RC2|RSA)/(?:ECB|CBC|PCBC|CFB(?:8|64|128)?|OFB(?:8|64|128)?|CTR|CTS|CCM|GCM)/(?:NO|PKCS[157]|ISO10126|OAEPWITH(?:MD5|SHA[-_]?(?:1|224|256|384|512))ANDMGF1)PADDING$",
          "(?i)^PBEWITH(?:HMAC)?(?:MD5|SHA(?:1|224|256|384|512))AND(?:AES(?:[-_]?(?:128|256))?|DES(?:EDE)?|TRIPLEDES|RC[24](?:[-_]?(?:40|128))?)$",
          "(?i)^(?:RSA1_5|RSA-OAEP(?:-(?:256|384|512))?|ECDH-ES(?:\\+A(?:128|192|256)(?:GCM)?KW)?|A(?:128|192|256)(?:KW|GCMKW|GCM|CBC-HS(?:256|384|512))|PBES2-HS(?:256|384|512)\\+A(?:128|192|256)KW)$",
          "(?i)^(?:RSA(?:ES)?[-_/](?:OAEP(?:[-_/](?:MD5|SHA[-_]?(?:1|224|256|384|512)))?|PKCS1(?:[-_]?V?1[_.]5)?|NO[-_]?PADDING)|ECIES(?:[-_/](?:P(?:256|384|521)|SECP(?:256K1|256R1|384R1|521R1)))?|ELGAMAL[-_/](?:ECB|OAEP|PKCS1)|SM2[-_/](?:C1C2C3|C1C3C2))$",
          "(?i)^(?:HMAC[-_]?(?:MD5|SHA[-_]?(?:1|224|256|384|512)|SHA3[-_]?(?:224|256|384|512))|PBKDF2[-_/](?:HMAC[-_]?)?(?:SHA[-_]?(?:1|224|256|384|512))|HKDF[-_/]SHA[-_]?(?:1|224|256|384|512)|(?:RSA|DSA|ECDSA|ED25519)[-_/](?:MD5|SHA[-_]?(?:1|224|256|384|512)|SHA3[-_]?(?:224|256|384|512))|(?:MD5|SHA[-_]?(?:1|224|256|384|512)|SHA3[-_]?(?:224|256|384|512))[-_/](?:RSA|DSA|ECDSA|ED25519))$",
          "(?i)^TLS_(?:(?:AES_(?:128|256)_GCM|CHACHA20_POLY1305)_SHA(?:256|384)|[A-Z0-9]+(?:_[A-Z0-9]+)*_WITH_[A-Z0-9]+(?:_[A-Z0-9]+)*)$",
          "(?i)^(?:AES(?:128|192|256)-(?:CBC|CTR|GCM)|CHACHA20-POLY1305)@OPENSSH\\.COM$"
        ],
        "isNegated": false
      },
      {
        "kind": "all",
        "clauses": [
          {
            "kind": "matches",
            "target": "match",
            "patterns": [
              "^(?i:passw(?:or)?d|psw|[_.-]pw)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]*[^\\x22\\x27\\x60 \\t\\r\\n]"
            ],
            "isNegated": false
          },
          {
            "kind": "matches",
            "target": "secret",
            "patterns": [
              "^[A-Za-z_][A-Za-z0-9_-]*:\\[[^]\\r\\n]+\\]$",
              "^[A-Za-z_][A-Za-z0-9_]*[)}\\]]+(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*(?:\\([^)]*\\))?)*$"
            ],
            "isNegated": false
          }
        ]
      },
      {
        "kind": "matches",
        "target": "match",
        "patterns": [
          "^(?i:passw(?:or)?d|psw|[_.-]pw)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]{0,5}[^\"'\\x60\\r\\n]*[.,][A-Za-z_][A-Za-z0-9_-]*="
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "match",
        "patterns": [
          "^(?i:passw(?:or)?d|psw|[_.-]pw)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]*(?i:nil|null|none|undefined|true|false|string|str|text|integer|int|number|boolean|bool|object)(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]*$|\\\\[nr])",
          "^(?i:passw(?:or)?d|psw|[_.-]pw)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]*(?:[$@][A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)*|:[A-Za-z_][A-Za-z0-9_]*|(?:::)?[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*::[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*|(?i:process\\.env|config|settings|credentials?|secrets?|var|local|module|data)(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\])+|[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*(?:\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)*|[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*\\.(?i:(?:[a-z0-9]+_)*(?:passw(?:or)?d|psw|token|secret|hex)))[)}\\]]*\\\\?(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]*$|\\\\[nr])"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "generic-username",
    "regex": "(?m)(?:^|[^a-zA-Z0-9])(?i:username|user|login(?:[_.-]?name)?|email(?:[_.-]?address)?|uid|account(?:[_.-]?name)?|client(?:[_.-]?(?:id|name))?)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]{0,5}(?:\"((?:\\\\.|[^\"\\\\\\r\\n]){3,250})\"|'((?:\\\\.|[^'\\\\\\r\\n]){3,250})'|\\x60((?:\\\\.|[^\\x60\\\\\\r\\n]){3,250})\\x60|([^:=\\s'\"\\x60,;][^\\s'\"\\x60,;]{2,249}))(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]*$|\\\\[nr])",
    "keywords": [
      "user",
      "login",
      "email",
      "uid",
      "account",
      "client"
    ],
    "filter": [
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^\\*+$",
          "^\\.+$",
          "(?i)^x{4,}$",
          "^•+$",
          "^\\$\\{.*}$",
          "^\\$\\([^\\r\\n]+\\)$",
          "^#\\{[^}\\r\\n]+}$",
          "^\\{\\{[ \\t]*.+[ \\t]*}}$",
          "^%\\{[^}]+}$",
          "^<[^>]+>$",
          "^<[^>\\s]+$",
          "^\\{[^}]+}$",
          "(?i)^\\[?(?:redacted|masked|filtered)\\]?$",
          "^(?:USERNAME|USER_NAME|USER|LOGIN|LOGIN_NAME|ACCOUNT_NAME|EMAIL|EMAIL_ADDRESS|UID|CLIENT|CLIENT_ID|CLIENT_NAME)$",
          "(?i)^(?:your|example)[_-]?(?:username|user_name|user|login|login_name|account_name|email|email_address|uid|client(?:_id|_name)?)$"
        ],
        "isNegated": false
      },
      {
        "kind": "matches",
        "target": "match",
        "patterns": [
          "^(?:[^a-zA-Z0-9])?(?i:username|user|login(?:[_.-]?name)?|email(?:[_.-]?address)?|uid|account(?:[_.-]name)?|client(?:[_.-]?(?:id|name))?)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]*(?i:nil|null|none|undefined|true|false|string|str|text|integer|int|number|boolean|bool|object)(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]*$|\\\\[nr])",
          "^(?:[^a-zA-Z0-9])?(?i:username|user|login(?:[_.-]?name)?|email(?:[_.-]?address)?|uid|account(?:[_.-]name)?|client(?:[_.-]?(?:id|name))?)\\b[ \\t'\"\\\\]{0,3}(?:=>|:=|=|:)[ \\t]*(?:[$@][A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)*|:[A-Za-z_][A-Za-z0-9_]*|(?:::)?[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*::[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*|(?i:process\\.env|config|settings|credentials?|secrets?|var|local|module|data)(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\])+|[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*(?:\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*|\\[[^]\\r\\n]+\\]|\\([^,\\r\\n)]*\\)?)*|[A-Za-z_][A-Za-z0-9_]*(?:(?:\\.|::)[A-Za-z_][A-Za-z0-9_]*)*\\.(?i:(?:[a-z0-9]+_)*(?:username|user|login(?:_name)?|email(?:_address)?|uid|account(?:_name)?|client(?:_(?:id|name))?|id)))[)}\\]]*\\\\?(?:[ \\t]*[,;)}\\]\\r\\n]|[ \\t]*$|\\\\[nr])"
        ],
        "isNegated": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "gitea-access-token",
    "regex": "(?i)(?:gitea[_.-]?(?:token|key|secret|access))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "gitea"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "github-app-token",
    "regex": "(?:ghu|ghs)_[0-9a-zA-Z]{36}",
    "keywords": [
      "ghu_",
      "ghs_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "github-fine-grained-pat",
    "regex": "github_pat_\\w{82}",
    "keywords": [
      "github_pat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "github-oauth",
    "regex": "gho_[0-9a-zA-Z]{36}",
    "keywords": [
      "gho_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "github-pat",
    "regex": "ghp_[0-9a-zA-Z]{36}",
    "keywords": [
      "ghp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "github-refresh-token",
    "regex": "ghr_[0-9a-zA-Z]{36}",
    "keywords": [
      "ghr_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-cicd-job-token",
    "regex": "glcbt-[0-9a-zA-Z]{1,5}_[0-9a-zA-Z_-]{20}",
    "keywords": [
      "glcbt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-deploy-token",
    "regex": "gldt-[0-9a-zA-Z_\\-]{20}",
    "keywords": [
      "gldt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-feature-flag-client-token",
    "regex": "glffct-[0-9a-zA-Z_\\-]{20}",
    "keywords": [
      "glffct-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-feed-token",
    "regex": "glft-[0-9a-zA-Z_\\-]{20}",
    "keywords": [
      "glft-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-incoming-mail-address-token",
    "regex": "incoming\\+(?:[A-Za-z0-9._-]+-)?\\d+-([A-Za-z0-9_-]+)-(?:issue(?:-\\d+)?|merge-request)@",
    "keywords": [
      "incoming+"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-incoming-mail-token",
    "regex": "glimt-[0-9a-zA-Z_\\-]{25}",
    "keywords": [
      "glimt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-kubernetes-agent-token",
    "regex": "glagent-[0-9a-zA-Z_\\-]{50}",
    "keywords": [
      "glagent-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-oauth-app-secret",
    "regex": "gloas-[0-9a-zA-Z_\\-]{64}",
    "keywords": [
      "gloas-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-pat",
    "regex": "glpat-[\\w-]{20}",
    "keywords": [
      "glpat-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-pat-routable",
    "regex": "\\bglpat-[0-9a-zA-Z_-]{27,300}\\.[0-9a-z]{2}[0-9a-z]{7}\\b",
    "keywords": [
      "glpat-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-pat-routable-versioned",
    "regex": "\\bglpat-[0-9a-zA-Z_-]{27,300}\\.[0-9a-z]{2}\\.[0-9a-z]{9}\\b",
    "keywords": [
      "glpat-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-ptt",
    "regex": "glptt-[0-9a-f]{40}",
    "keywords": [
      "glptt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-rrt",
    "regex": "GR1348941[\\w-]{20}",
    "keywords": [
      "gr1348941"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-runner-authentication-token",
    "regex": "glrt-[0-9a-zA-Z_\\-]{20}",
    "keywords": [
      "glrt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-runner-authentication-token-routable",
    "regex": "\\bglrt-t\\d_[0-9a-zA-Z_\\-]{27,300}\\.[0-9a-z]{2}[0-9a-z]{7}\\b",
    "keywords": [
      "glrt-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-scim-token",
    "regex": "glsoat-[0-9a-zA-Z_\\-]{20}",
    "keywords": [
      "glsoat-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitlab-session-cookie",
    "regex": "_gitlab_session=[0-9a-z]{32}",
    "keywords": [
      "_gitlab_session="
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gitter-access-token",
    "regex": "(?i)(?:gitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "gitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "gocardless-api-token",
    "regex": "(?i)(?:gocardless)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(live_(?i)[a-z0-9\\-_=]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "live_",
      "gocardless"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "grafana-api-key",
    "regex": "\\b(eyJrIjoi[A-Za-z0-9+/]{40,380}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "eyjrijoi"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "grafana-cloud-api-token",
    "regex": "\\b(glc_[A-Za-z0-9+/]{40,150}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "glc_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "grafana-service-account-token",
    "regex": "\\b(glsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "glsa_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "greptile-api-key",
    "regex": "(?i)(?:greptile)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-zA-Z0-9+/]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "greptile"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "groq-api-key",
    "regex": "(?i)\\b(gsk_[A-Z0-9]{52})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "gsk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "gumroad-access-token",
    "regex": "(?i)(?:gumroad)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:[a-f0-9]{64}|[A-Za-z0-9-]{43}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "gumroad"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "harness-api-key",
    "regex": "(?:pat|sat)\\.[a-zA-Z0-9_-]{22}\\.[0-9a-f]{24}\\.[a-zA-Z0-9]{20}",
    "keywords": [
      "pat.",
      "sat."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "hashicorp-tf-api-token",
    "regex": "(?i)[a-z0-9]{14}\\.(?-i:atlasv1)\\.[a-z0-9\\-_=]{60,70}",
    "keywords": [
      "atlasv1"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "heroku-api-key",
    "regex": "(?i)(?:heroku)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "heroku"
    ]
  },
  {
    "id": "heroku-api-key-v2",
    "regex": "\\b((HRKU-AA[0-9a-zA-Z_-]{58}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hrku-aa"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "highnote-secret-live-key",
    "regex": "(?i:(?:highnote(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token|sk[_. -]*live))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk_live_a2V5Xz[A-Za-z0-9+/]{69}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "highnote"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "honeycomb-api-key",
    "regex": "(?i)(?:honeycomb)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:[a-f0-9]{32}|[a-z0-9]{22}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "honeycomb"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "hubspot-api-key",
    "regex": "(?i)(?:hubspot)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hubspot"
    ]
  },
  {
    "id": "huggingface-access-token",
    "regex": "\\b(hf_(?i:[a-z]{34}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hf_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "huggingface-organization-api-token",
    "regex": "\\b(api_org_(?i:[a-z]{34}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "api_org_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "hunter-api-key.1",
    "regex": "(?i:(?:hunter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hunter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "ibm-cloud-user-api-key",
    "regex": "(?i)(?:ibm(?:cloud)?|bx)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{42,44})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ibm"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "influxdb-api-token",
    "regex": "(?i)(?:\\binflux(?:db)?\\b(?:.|[\\n\\r]){0,64}?\\b(?:token|api[_-]?key)\\b(?:.|[\\n\\r]){0,32}?)[=:\"'\\s]{1,8}([A-Za-z0-9+/=_-]{88,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "influx"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "infomaniak-api-token",
    "regex": "(?i)(?:infomaniak)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_\\-]{60,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "infomaniak"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "infracost-api-token",
    "regex": "\\b(ico-[a-zA-Z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ico-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "instantly-api-key.1",
    "regex": "(?i:(?:instantly)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9+/]{66}==)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "instantly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "intercom-api-key",
    "regex": "(?i)(?:intercom)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{60})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "intercom"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "intra42-client-secret",
    "regex": "\\b(s-s4t2(?:ud|af)-(?i)[abcdef0123456789]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "intra",
      "s-s4t2ud-",
      "s-s4t2af-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "ionic-personal-access-token",
    "regex": "\\b(ion_[A-Za-z0-9]{42})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ionic"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "jumpcloud-api-key",
    "regex": "(?i)(?:jumpcloud)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "jumpcloud"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "jwt",
    "regex": "\\b(ey[a-zA-Z0-9]{17,}\\.ey[a-zA-Z0-9\\/\\\\_-]{17,}\\.(?:[a-zA-Z0-9\\/\\\\_-]{10,}={0,2})?)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "eyj"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "jwt-base64",
    "regex": "\\bZXlK(?:(?P<alg>aGJHY2lPaU)|(?P<apu>aGNIVWlPaU)|(?P<apv>aGNIWWlPaU)|(?P<aud>aGRXUWlPaU)|(?P<b64>aU5qUWlP)|(?P<crit>amNtbDBJanBi)|(?P<cty>amRIa2lPaU)|(?P<epk>bGNHc2lPbn)|(?P<enc>bGJtTWlPaU)|(?P<jku>cWEzVWlPaU)|(?P<jwk>cWQyc2lPb)|(?P<iss>cGMzTWlPaU)|(?P<iv>cGRpSTZJ)|(?P<kid>cmFXUWlP)|(?P<key_ops>clpYbGZiM0J6SWpwY)|(?P<kty>cmRIa2lPaUp)|(?P<nonce>dWIyNWpaU0k2)|(?P<p2c>d01tTWlP)|(?P<p2s>d01uTWlPaU)|(?P<ppt>d2NIUWlPaU)|(?P<sub>emRXSWlPaU)|(?P<svt>emRuUWlP)|(?P<tag>MFlXY2lPaU)|(?P<typ>MGVYQWlPaUp)|(?P<url>MWNtd2l)|(?P<use>MWMyVWlPaUp)|(?P<ver>MlpYSWlPaU)|(?P<version>MlpYSnphVzl1SWpv)|(?P<x>NElqb2)|(?P<x5c>NE5XTWlP)|(?P<x5t>NE5YUWlPaU)|(?P<x5ts256>NE5YUWpVekkxTmlJNkl)|(?P<x5u>NE5YVWlPaU)|(?P<zip>NmFYQWlPaU))[a-zA-Z0-9\\/\\\\_+\\-\\r\\n]{40,}={0,2}",
    "keywords": [
      "zxlk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "kagi-api-key",
    "regex": "(?i)(?:kagi)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{11}\\.[a-z0-9_-]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "kagi"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "kimi-api-key",
    "regex": "(?i)(?:kimi|moonshot)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk-[A-Za-z0-9_-]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "kimi",
      "moonshot"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "klaviyo-api-key",
    "regex": "(?i)(?:klaviyo)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(pk_[a-z0-9]{34})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "klaviyo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "kraken-access-token",
    "regex": "(?i)(?:kraken)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9\\/=_\\+\\-]{80,90})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "kraken"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "kucoin-access-token",
    "regex": "(?i)(?:kucoin)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "kucoin"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "kucoin-secret-key",
    "regex": "(?i)(?:kucoin)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "kucoin"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "langchain-langsmith-personal-access-token",
    "regex": "\\b(lsv2_pt_[0-9a-fA-F]{32}_[0-9a-fA-F]{10})",
    "keywords": [
      "lsv2_pt_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "langchain-langsmith-service-key",
    "regex": "\\b(lsv2_sk_[0-9a-fA-F]{32}_[0-9a-fA-F]{10})",
    "keywords": [
      "lsv2_sk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "langfuse-public-key.1",
    "regex": "\\b(pk-lf-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pk-lf-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "langfuse-secret-key.1",
    "regex": "\\b(sk-lf-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk-lf-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "components": [
      "langfuse-public-key.1"
    ]
  },
  {
    "id": "lark-app-id",
    "regex": "\\b(cli_[A-Za-z0-9]{16})",
    "keywords": [
      "cli_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "lark-app-secret",
    "regex": "(?i)(?:lark|larksuite)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "lark"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "lark-app-id"
    ]
  },
  {
    "id": "launchdarkly-access-token",
    "regex": "(?i)(?:launchdarkly)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "launchdarkly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "lichess-personal-access-token",
    "regex": "\\b(lip_[A-Za-z0-9_]{16,60})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "lip_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "lighton-paradigm-api-key",
    "regex": "(?i)(?:lighton|paradigm)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_\\-]{40,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "lighton",
      "paradigm"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "linear-api-key",
    "regex": "lin_api_(?i)[a-z0-9]{40}",
    "keywords": [
      "lin_api_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "linear-client-secret",
    "regex": "(?i)(?:linear)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "linear"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "linkedin-client-id",
    "regex": "(?i)(?:linked[_-]?in)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{14})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "linkedin",
      "linked_in",
      "linked-in"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "linkedin-client-secret",
    "regex": "(?i)(?:linked[_-]?in)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "linkedin",
      "linked_in",
      "linked-in"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "llama-cloud-api-key.1",
    "regex": "\\b(llx-[A-Za-z0-9]{44,52})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "llx-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "lob-api-key",
    "regex": "(?i)(?:lob)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((live|test)_[a-f0-9]{35})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "test_",
      "live_"
    ]
  },
  {
    "id": "lob-pub-api-key",
    "regex": "(?i)(?:lob)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((test|live)_pub_[a-f0-9]{31})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "test_pub_",
      "live_pub_"
    ]
  },
  {
    "id": "looker-client-id",
    "regex": "(?i)(?:looker)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "looker"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "looker-client-secret",
    "regex": "(?i)(?:looker)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "looker"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "mailchimp-api-key",
    "regex": "(?i)(?:MailchimpSDK.initialize|mailchimp)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32}-us\\d\\d)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mailchimp"
    ]
  },
  {
    "id": "mailersend-api-token",
    "regex": "\\b(mlsn\\.[A-Za-z0-9]{30,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mlsn."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "mailgun-private-api-token",
    "regex": "(?i)(?:mailgun)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(key-[a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mailgun"
    ]
  },
  {
    "id": "mailgun-pub-key",
    "regex": "(?i)(?:mailgun)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(pubkey-[a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mailgun"
    ]
  },
  {
    "id": "mailgun-signing-key",
    "regex": "(?i)(?:mailgun)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-h0-9]{32}-[a-h0-9]{8}-[a-h0-9]{8})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mailgun"
    ]
  },
  {
    "id": "mapbox-api-token",
    "regex": "(?i)(?:mapbox)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(pk\\.[a-z0-9]{60}\\.[a-z0-9]{22})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mapbox"
    ]
  },
  {
    "id": "mattermost-access-token",
    "regex": "(?i)(?:mattermost)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{26})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mattermost"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "maxmind-license-key",
    "regex": "\\b([A-Za-z0-9]{6}_[A-Za-z0-9]{29}_mmk)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "_mmk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "mem0-api-key.1",
    "regex": "(?i:(?:mem0)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(m0-[A-Za-z0-9]{24,44})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mem0"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "mercury-production-api-token",
    "regex": "\\b(mercury_production_[a-z]{3,6}_[A-Za-z0-9]{40,50}_yrucrem)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mercury_production_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "mergify-application-key",
    "regex": "\\b(mergify_application_key_[A-Za-z0-9_-]{40,200})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mergify_application_key_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.2,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "messagebird-api-token",
    "regex": "(?i)(?:message[_-]?bird)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{25})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "messagebird",
      "message-bird",
      "message_bird"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "messagebird-client-id",
    "regex": "(?i)(?:message[_-]?bird)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "messagebird",
      "message-bird",
      "message_bird"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "microsoft-teams-webhook",
    "regex": "https://[a-z0-9]+\\.webhook\\.office\\.com/webhookb2/[a-z0-9]{8}-([a-z0-9]{4}-){3}[a-z0-9]{12}@[a-z0-9]{8}-([a-z0-9]{4}-){3}[a-z0-9]{12}/IncomingWebhook/[a-z0-9]{32}/[a-z0-9]{8}-([a-z0-9]{4}-){3}[a-z0-9]{12}",
    "keywords": [
      "webhook.office.com",
      "webhookb2",
      "incomingwebhook"
    ]
  },
  {
    "id": "midtrans-production-server-client-key",
    "regex": "(?i)(?:midtrans|mid[_-]?)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(Mid-(?:server|client)-[A-Za-z0-9_]{10,20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mid-server-",
      "mid-client-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.8,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "minimax-api-key",
    "regex": "(?i)\\b(sk-api-[A-Za-z0-9_-]{119})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk-api-",
      "minimax"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "miro-access-token",
    "regex": "\\b(eyJtaXJv[A-Za-z0-9-]{10,64}_[A-Za-z0-9_-]{20,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "miro"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "miro-client-id",
    "regex": "(?i)(?:miro[_. -]*client[_. -]*id)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9]{15,21})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "miro"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.5,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "miro-client-secret",
    "regex": "(?i)(?:miro)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "miro"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "miro-client-id"
    ]
  },
  {
    "id": "mistral-api-key",
    "regex": "(?i)(?:mistral)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mistral"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "monday-api-token.1",
    "regex": "(?i:(?:monday)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(eyJ[A-Za-z0-9_-]{10,200}\\.eyJ[A-Za-z0-9_-]{50,1000}\\.[A-Za-z0-9_-]{20,500})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "monday"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "mongodb-atlas-service-account-id",
    "regex": "\\b(mdb_sa_id_[a-f0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mdb_sa_id_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "mongodb-atlas-service-account-secret",
    "regex": "\\b(mdb_sa_sk_[A-Za-z0-9_-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mdb_sa_sk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^mdb_sa_sk_[0-9]{40}$"
        ],
        "isNegated": false
      }
    ],
    "components": [
      "mongodb-atlas-service-account-id"
    ]
  },
  {
    "id": "mongodb-connection-string",
    "regex": "\\b(mongodb(?:\\+srv)?://(?P<username>[!-9;-~]{3,50}):(?P<password>[!-?A-~]{3,88})@(?P<host>(?:[a-zA-Z0-9][\\w.-]+|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})(?::\\d{1,5})?(?:,(?:[a-zA-Z0-9][\\w.-]+|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})(?::\\d{1,5})?)*)/?(?:(?P<authdb>[\\w-]+)?(?P<options>\\?\\w+=[\\w@/.$-]+(?:&(?:amp;)?\\w+=[\\w@/.$-]+)*)?)?)(?:['\"\\s;\\x60]|\\\\[nr]|\\b|$)",
    "keywords": [
      "mongodb://",
      "mongodb+srv://"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "(?i)\\bmongodb(?:\\+srv)?:\\/\\/(?:user(?:name)?|foo):(?:pass(?:word)?|bar)(?:[^@\\/]*)?@",
          "(?i)\\bmongodb(?:\\+srv)?:\\/\\/[^\\s'\"\\x60]*(?:\\$\\{\\{[^}]+}}|\\$\\{[^}]+}|\\$[A-Za-z_][A-Za-z0-9_]*|{{[^}]+}}|<[^>]+>|\\[[^]]+])[^\\s'\"\\x60]*"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "mux-access-token-id.1",
    "regex": "(?i)(?:mux[_.-]?(?:access[_.-]?)?token[_.-]?(?:id|identifier))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mux"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "mux-access-token-secret.1",
    "regex": "(?i:(?:mux[_.-]?(?:access[_.-]?)?token[_.-]?(?:secret|private|key))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9+/]{75})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "mux"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "mux-access-token-id.1"
    ]
  },
  {
    "id": "neon-api-key",
    "regex": "\\b(napi_[A-Za-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "napi_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "netlify-access-token",
    "regex": "(?i)(?:netlify)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{40,46})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "netlify"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "new-relic-browser-api-token",
    "regex": "(?i)(?:new-relic|newrelic|new_relic)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(NRJS-[a-f0-9]{19})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nrjs-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "new-relic-insert-key",
    "regex": "(?i)(?:new-relic|newrelic|new_relic)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(NRII-[a-z0-9-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nrii-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "new-relic-user-api-id",
    "regex": "(?i)(?:new-relic|newrelic|new_relic)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "new-relic",
      "newrelic",
      "new_relic"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "new-relic-user-api-key",
    "regex": "(?i)(?:new-relic|newrelic|new_relic)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(NRAK-[a-z0-9]{27})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nrak"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "ngrok-api-key.1",
    "regex": "(?i:(?:ngrok[_. -]*(?:(?:api|agent)[_. -]*)?(?:secret|key|token|authtoken))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(2[A-Za-z0-9]{26}_[0-9][A-Za-z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ngrok"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "notion-api-token",
    "regex": "\\b(ntn_[0-9]{11}[A-Za-z0-9]{32}[A-Za-z0-9]{3})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ntn_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "npm-access-token",
    "regex": "(?i)\\b(npm_[a-z0-9]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "npm_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "nvidia-api-key",
    "regex": "(?i)\\b(nvapi-[A-Z0-9_-]{60,70})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nvapi-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "nylas-api-key.1",
    "regex": "\\b(nyk_[A-Za-z0-9]{67})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nyk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "nytimes-access-token",
    "regex": "(?i)(?:nytimes|new-york-times|newyorktimes)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9=_\\-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "nytimes",
      "new-york-times",
      "newyorktimes"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "octopus-deploy-api-key",
    "regex": "\\b(API-[A-Z0-9]{26})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "api-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "okta-access-token",
    "regex": "(?i:(?:(?-i:[Oo]kta|OKTA))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(00[\\w=\\-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "okta"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "ollama-api-key",
    "regex": "(?i)(?:ollama)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32}\\.[a-zA-Z0-9_-]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ollama"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "onesignal-rich-authentication-token",
    "regex": "\\b(os_v2_(?:app|org)_[a-z2-7]{103})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "os_v2_app_",
      "os_v2_org_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "onfido-live-api-token-ca",
    "regex": "\\b(api_live_ca\\.[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "api_live_ca."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "onfido-live-api-token-eu",
    "regex": "\\b(api_live\\.[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "api_live."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "onfido-live-api-token-us",
    "regex": "\\b(api_live_us\\.[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "api_live_us."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "openai-api-key",
    "regex": "\\b(sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58}|[A-Za-z0-9_-]{20})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58}|[A-Za-z0-9_-]{20})\\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "t3blbkfj"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "openrouter-api-key",
    "regex": "(?i)\\b(sk-or-v1-[0-9a-f]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk-or-v1-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "openshift-user-token",
    "regex": "\\b(sha256~[\\w-]{43})(?:[^\\w-]|\\z)",
    "keywords": [
      "sha256~"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "openweather-api-key",
    "regex": "(?i:(?:openweather|pyowm)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "openweather",
      "pyowm"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "opsgenie-api-key.1",
    "regex": "(?i)(?:opsgenie)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "opsgenie"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "ovh-application-key",
    "regex": "(?i)(?:app(?:lication)?[_.-]{0,1}key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9-]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ovh"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "ovh-application-secret",
    "regex": "(?i)(?:app(?:lication)?[_.-]{0,1}secret)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ovh"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "components": [
      "ovh-application-key",
      "ovh-consumer-key"
    ]
  },
  {
    "id": "ovh-consumer-key",
    "regex": "(?i)(?:consumer[_.-]{0,1}key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9-]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ovh"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "paddle-live-api-key",
    "regex": "\\b(pdl_live_apikey_[a-z0-9]{26}_[A-Za-z0-9]{22}_[A-Za-z0-9]{3})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pdl_live_apikey_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "pagerduty-authorization-token.1",
    "regex": "(?i:(?:pagerduty)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(u\\+[A-Za-z0-9_+-]{18})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pagerduty"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "paypal-client-id.1",
    "regex": "(?i:(?:paypal[_.-]?(?:client[_.-]?)?(?:id|user))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(A[A-Za-z0-9_-]{78,99})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "paypal"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "paypal-client-secret.1",
    "regex": "(?i:(?:paypal[_.-]?(?:client[_.-]?)?(?:secret|private|access|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_.-]{78,120})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "paypal"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "paypal-client-id.1"
    ]
  },
  {
    "id": "perplexity-api-key",
    "regex": "\\b(pplx-[a-zA-Z0-9]{48})(?:[\\x60'\"\\s;]|\\\\[nr]|$|\\b)",
    "keywords": [
      "pplx-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "persona-production-api-key",
    "regex": "\\b(persona_production_[a-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "persona_production_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "pinecone-api-key.1",
    "regex": "(?i:(?:pinecone(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pinecone"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "pinecone-api-key.2",
    "regex": "\\b(pcsk_[A-Za-z0-9]{5,6}_[A-Za-z0-9]{63})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pcsk_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "pinterest-access-token",
    "regex": "\\b(pina_[A-Za-z0-9_-]{20,200})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pina_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "plaid-api-token",
    "regex": "(?i)(?:plaid)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(access-(?:sandbox|development|production)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "plaid"
    ]
  },
  {
    "id": "plaid-client-id",
    "regex": "(?i)(?:plaid)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "plaid"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "plaid-secret-key",
    "regex": "(?i)(?:plaid)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "plaid"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "planetscale-api-token",
    "regex": "\\b(pscale_tkn_(?i)[\\w=\\.-]{32,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pscale_tkn_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "components": [
      "planetscale-id"
    ]
  },
  {
    "id": "planetscale-id",
    "regex": "(?i)(?:pscale|planetscale)(?:.|[\\n\\r]){0,16}?(?:USER|ID|NAME)(?:.|[\\n\\r]){0,16}?([a-z0-9]{12})",
    "keywords": [
      "pscale",
      "planetscale"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "planetscale-oauth-token",
    "regex": "\\b(pscale_oauth_[\\w=\\.-]{32,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pscale_oauth_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "planetscale-password",
    "regex": "(?i)\\b(pscale_pw_(?i)[\\w=\\.-]{32,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pscale_pw_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "plivo-auth-id",
    "regex": "(?i)(?:plivo(?:[_. -]*(?:auth|account))?[_. -]*(?:id|sid))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(MA[A-Z0-9]{18})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "plivo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2.8,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "plivo-auth-token",
    "regex": "(?i:(?:plivo(?:[_. -]*(?:auth))?[_. -]*(?:secret|token|key))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "plivo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "plivo-auth-id"
    ]
  },
  {
    "id": "polar-oauth-access-token",
    "regex": "\\b(polar_at_[A-Za-z0-9_-]{20,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "polar_at_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "polar-organization-access-token",
    "regex": "\\b(polar_oat_[A-Za-z0-9_-]{20,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "polar_oat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "polar-personal-access-token",
    "regex": "\\b(polar_pat_[A-Za-z0-9_-]{20,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "polar_pat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "polymarket-address",
    "regex": "(?i:(?:poly.{0,20}address)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(0x[a-fA-F0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "poly"
    ],
    "skipReport": true
  },
  {
    "id": "polymarket-api-key",
    "regex": "(?i:(?:poly.{0,20}key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "poly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "components": [
      "polymarket-api-secret",
      "polymarket-passphrase"
    ]
  },
  {
    "id": "polymarket-api-secret",
    "regex": "(?i:(?:poly.{0,20}secret)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-zA-Z0-9+/]{40,}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "poly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "polymarket-passphrase",
    "regex": "(?i:(?:poly.{0,20}passphrase)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-zA-Z0-9_]{8,128})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "poly"
    ],
    "skipReport": true
  },
  {
    "id": "polymarket-private-key",
    "regex": "(?i:(?:poly.{0,20}private.{0,20}key)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(0x[a-fA-F0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "poly"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "posthog-personal-api-key",
    "regex": "(?i)\\b(phx_[a-zA-Z0-9_\\-]{41,49})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "phx_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "posthog-project-api-key",
    "regex": "(?i)\\b(phc_[a-zA-Z0-9_\\-]{41,44})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "phc_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "postman-api-token",
    "regex": "\\b(PMAK-(?i)[a-f0-9]{24}\\-[a-f0-9]{34})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pmak-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "postmark-api-token.1",
    "regex": "(?i)(?:postmark)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "postmark"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "prefect-api-token",
    "regex": "\\b(pnu_[a-zA-Z0-9]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pnu_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "private-key",
    "regex": "(?i)-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\\s\\S-]{64,}?KEY(?: BLOCK)?-----",
    "keywords": [
      "-----begin"
    ]
  },
  {
    "id": "privateai-api-token",
    "regex": "(?i:(?:private[_-]?ai)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "privateai",
      "private_ai",
      "private-ai"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "proof-full-access-api-key",
    "regex": "\\b(prf_(?:cli_)?[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "prf_"
    ],
    "filter": [
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^prf_(?:cli_)?test_"
        ],
        "isNegated": false
      },
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "pulumi-api-token",
    "regex": "\\b(pul-[a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "pul-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "pypi-upload-token",
    "regex": "pypi-AgEIcHlwaS5vcmc[\\w-]{50,1000}",
    "keywords": [
      "pypi-ageichlwas5vcmc"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "rainforest-pay-production-api-key",
    "regex": "(?i:(?:rainforest(?:[_. -]*pay)?(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(apikey_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rainforest"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "ramp-client-id",
    "regex": "\\b(ramp_id_[A-Za-z0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ramp_id_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "ramp-client-secret",
    "regex": "\\b(ramp_sec_[A-Za-z0-9]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ramp_sec_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "ramp-client-id"
    ]
  },
  {
    "id": "rapidapi-access-token",
    "regex": "(?i)(?:rapidapi)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9_-]{50})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rapidapi"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "razorpay-key-id.1",
    "regex": "\\b(rzp_(?:live|test)_[A-Za-z0-9]{14})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rzp_live_",
      "rzp_test_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "razorpay-key-secret.1",
    "regex": "(?i:(?:razorpay[_.-]?(?:(?:api|key)[_.-]?)?(?:secret|private|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "razorpay"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "components": [
      "razorpay-key-id.1"
    ]
  },
  {
    "id": "readme-api-token",
    "regex": "\\b(rdme_[a-z0-9]{70})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rdme_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "redirect-pizza-api-token.1",
    "regex": "\\b(rpa_[A-Za-z0-9]{30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rpa_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "render-api-key",
    "regex": "\\b(rnd_[A-Za-z0-9]{28})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rnd_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "replicate-api-token",
    "regex": "(?i)\\b(r8_[A-Za-z0-9]{37})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "r8_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "resend-api-key.1",
    "regex": "\\b(re_[1-9A-HJ-NP-Za-km-z]{8}_[1-9A-HJ-NP-Za-km-z]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "resend"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "retell-api-key.1",
    "regex": "(?i:(?:retell)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(key_[a-f0-9]{28})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "retell"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "rootly-api-key.1",
    "regex": "\\b(rootly_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rootly_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "rubygems-api-token",
    "regex": "\\b(rubygems_[a-f0-9]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rubygems_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "runpod-api-key.1",
    "regex": "\\b(rpa_[A-Z0-9]{40}[A-Za-z0-9]{6})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "rpa_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "salesforce-access-token.1",
    "regex": "\\b(00[A-Za-z0-9]{13}![A-Za-z0-9._-]{80,260})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "salesforce.com"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ],
    "components": [
      "salesforce-instance-url.1"
    ]
  },
  {
    "id": "salesforce-instance-url.1",
    "regex": "(?i)(?:^|[^a-z0-9.-])(?:https?://)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){0,4}\\.my\\.salesforce\\.com|[a-z]{2,8}[0-9]{1,4}\\.salesforce\\.com))(?:[^a-z0-9.-]|$)",
    "keywords": [
      "salesforce.com"
    ],
    "skipReport": true
  },
  {
    "id": "samsara-api-token.1",
    "regex": "\\b(samsara_api_[A-Za-z0-9]{26,32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "samsara_api_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "scaleway-secret-key",
    "regex": "(?i)(?:(?:scaleway|scw).{0,20}?(?:secret|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "scaleway",
      "scw"
    ]
  },
  {
    "id": "scalingo-api-token",
    "regex": "\\b(tk-us-[\\w-]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tk-us-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "scalr-api-access-token.1",
    "regex": "(?i:(?:scalr(?:[_. -]*(?:api|access))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.eyJpc3MiOiJ1c2VyIiwianRpIjoiYXQt[A-Za-z0-9_-]{20,40}\\.[A-Za-z0-9_-]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "scalr"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "segment-public-api-token.1",
    "regex": "\\b(sgp_[A-Za-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sgp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sendbird-access-id",
    "regex": "(?i)(?:sendbird)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sendbird"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sendbird-access-token",
    "regex": "(?i)(?:sendbird)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sendbird"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sendgrid-api-token",
    "regex": "\\b(SG\\.(?i)[a-z0-9=_\\-\\.]{66})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sg."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "sendinblue-api-token",
    "regex": "\\b(xkeysib-[a-fA-F0-9]{64}-[a-zA-Z0-9]{16})\\b",
    "keywords": [
      "xkeysib-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.2,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sentry-access-token",
    "regex": "(?i)(?:sentry)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sentry"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sentry-org-token",
    "regex": "\\bsntrys_eyJpYXQiO[a-zA-Z0-9+/]{10,200}(?:LCJyZWdpb25fdXJs|InJlZ2lvbl91cmwi|cmVnaW9uX3VybCI6)[a-zA-Z0-9+/]{10,200}={0,2}_[a-zA-Z0-9+/]{43}(?:[^a-zA-Z0-9+/]|\\z)",
    "keywords": [
      "sntrys_eyjpyxqio"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sentry-user-token",
    "regex": "\\b(sntryu_[a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sntryu_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "settlemint-application-access-token",
    "regex": "\\b(sm_aat_[a-zA-Z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sm_aat"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "settlemint-personal-access-token",
    "regex": "\\b(sm_pat_[a-zA-Z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sm_pat"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "settlemint-service-access-token",
    "regex": "\\b(sm_sat_[a-zA-Z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sm_sat"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "shippo-api-token",
    "regex": "\\b(shippo_(?:live|test)_[a-fA-F0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "shippo_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "shopify-access-token",
    "regex": "shpat_[a-fA-F0-9]{32}",
    "keywords": [
      "shpat_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "shopify-custom-access-token",
    "regex": "shpca_[a-fA-F0-9]{32}",
    "keywords": [
      "shpca_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "shopify-private-app-access-token",
    "regex": "shppa_[a-fA-F0-9]{32}",
    "keywords": [
      "shppa_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "shopify-shared-secret",
    "regex": "shpss_[a-fA-F0-9]{32}",
    "keywords": [
      "shpss_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "sidekiq-secret",
    "regex": "(?i)(?:BUNDLE_ENTERPRISE__CONTRIBSYS__COM|BUNDLE_GEMS__CONTRIBSYS__COM)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{8}:[a-f0-9]{8})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "bundle_enterprise__contribsys__com",
      "bundle_gems__contribsys__com"
    ]
  },
  {
    "id": "sidekiq-sensitive-url",
    "regex": "(?i)\\bhttps?://([a-f0-9]{8}:[a-f0-9]{8})@(?:gems.contribsys.com|enterprise.contribsys.com)(?:[\\/|\\#|\\?|:]|$)",
    "keywords": [
      "gems.contribsys.com",
      "enterprise.contribsys.com"
    ]
  },
  {
    "id": "slack-app-token",
    "regex": "(?i)xapp-\\d-[A-Z0-9]+-\\d+-[a-z0-9]+",
    "keywords": [
      "xapp"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-bot-token",
    "regex": "xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*",
    "keywords": [
      "xoxb"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-config-access-token",
    "regex": "(?i)xoxe.xox[bp]-\\d-[A-Z0-9]{163,166}",
    "keywords": [
      "xoxe.xoxb-",
      "xoxe.xoxp-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-config-refresh-token",
    "regex": "(?i)xoxe-\\d-[A-Z0-9]{146}",
    "keywords": [
      "xoxe-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-legacy-bot-token",
    "regex": "xoxb-[0-9]{8,14}-[a-zA-Z0-9]{18,26}",
    "keywords": [
      "xoxb"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-legacy-token",
    "regex": "xox[os]-\\d+-\\d+-\\d+-[a-fA-F\\d]+",
    "keywords": [
      "xoxo",
      "xoxs"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-legacy-workspace-token",
    "regex": "xox[ar]-(?:\\d-)?[0-9a-zA-Z]{8,48}",
    "keywords": [
      "xoxa",
      "xoxr"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-session-cookie",
    "regex": "(xoxd-[\\w\\/\\\\+-]{100,}={0,2})(?:[^\\w\\/+=-]|\\z)",
    "keywords": [
      "xoxd-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-session-token",
    "regex": "xoxc-\\d{9,15}-\\d{9,15}-\\d{9,15}-[a-f0-9]{64}\\b",
    "keywords": [
      "xoxc-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-user-token",
    "regex": "xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}",
    "keywords": [
      "xoxp-",
      "xoxe-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "slack-webhook-url",
    "regex": "(?:https?://)?hooks.slack.com/(?:services|workflows|triggers)/[A-Za-z0-9+/]{43,56}",
    "keywords": [
      "hooks.slack.com"
    ]
  },
  {
    "id": "snowflake-account-host.1",
    "regex": "(?i)\\b([a-z0-9_-]+(?:\\.[a-z0-9_-]+)*\\.snowflakecomputing\\.com)\\b",
    "keywords": [
      "snowflakecomputing.com"
    ],
    "skipReport": true
  },
  {
    "id": "snowflake-programmatic-access-token.1",
    "regex": "(?i:(?:(?:snowflake[_. -]*(?:programmatic[_. -]*)?(?:access[_. -]*)?token|sf[_. -]*token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9_-]{100,500})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "snowflake",
      "sf_token"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "snowflake-account-host.1"
    ]
  },
  {
    "id": "snyk-api-token",
    "regex": "(?i)(?:snyk[_.-]?(?:(?:api|oauth)[_.-]?)?(?:key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "snyk"
    ]
  },
  {
    "id": "sonar-api-token",
    "regex": "(?i)(?:sonar[_.-]?(login|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:squ_|sqp_|sqa_)?[a-z0-9=_\\-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sonar"
    ],
    "secretGroup": 2
  },
  {
    "id": "sourcegraph-access-token",
    "regex": "(?i)\\b(sgp_(?:[a-fA-F0-9]{16}|local)_[a-fA-F0-9]{40}|sgp_[a-fA-F0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sgp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "square-access-token",
    "regex": "\\b((?:EAAA|sq0atp-)[\\w-]{22,60})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sq0atp-",
      "eaaa"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "squarespace-access-token",
    "regex": "(?i)(?:squarespace)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "squarespace"
    ]
  },
  {
    "id": "sslmate-api-key.1",
    "regex": "(?i:(?:sslmate(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sslmate"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "stability-ai-api-key",
    "regex": "(?i)(?:stability)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk-[A-Za-z0-9]{48})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "stability"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "stripe-access-token",
    "regex": "\\b((?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sk_test",
      "sk_live",
      "sk_prod",
      "rk_test",
      "rk_live",
      "rk_prod"
    ],
    "filter": [
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^sk_live_a2V5Xz"
        ],
        "isNegated": false
      },
      {
        "kind": "entropy",
        "limit": 2,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "sumologic-access-id",
    "regex": "(?i)(?:(?-i:[Ss]umo|SUMO))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?-i:su)[a-zA-Z0-9]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sumo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "sumologic-access-token",
    "regex": "(?i)(?:(?-i:[Ss]umo|SUMO))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sumo"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "supabase-management-token",
    "regex": "\\b(sbp_[a-z0-9_-]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sbp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^sbp_[a-z0-9_-]*[0-9][a-z0-9_-]*[0-9][a-z0-9_-]*$"
        ],
        "isNegated": true
      }
    ]
  },
  {
    "id": "supabase-project-api-key",
    "regex": "\\b(sb_secret_[A-Za-z0-9_-]{31})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "sb_secret_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ],
    "components": [
      "supabase-project-url"
    ]
  },
  {
    "id": "supabase-project-url",
    "regex": "\\b(https://[a-z0-9]{16,32}\\.supabase\\.co)\\b",
    "keywords": [
      "supabase.co"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ],
    "skipReport": true
  },
  {
    "id": "tableau-personal-access-token-name.1",
    "regex": "(?i:(?:tableau(?:[_. -]*(?:personal[_. -]*access|pat))?[_. -]*(?:token[_. -]*)?name)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z][A-Za-z0-9_-]{2,50})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tableau"
    ],
    "skipReport": true
  },
  {
    "id": "tableau-personal-access-token.1",
    "regex": "\\b([A-Za-z0-9+/]{22}==:[A-Za-z0-9]{32})\\b",
    "keywords": [
      "tableau"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "tableau-personal-access-token-name.1",
      "tableau-server-host.1"
    ]
  },
  {
    "id": "tableau-server-host.1",
    "regex": "(?i)\\b([a-z0-9-]+\\.online\\.tableau\\.com)\\b",
    "keywords": [
      "online.tableau.com"
    ],
    "skipReport": true
  },
  {
    "id": "tailscale-api-key.1",
    "regex": "\\b(tskey-api-[A-Za-z0-9_-]{20,36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tskey-api-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "telegram-bot-api-token",
    "regex": "(?i)(?:telegr)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9]{5,16}:(?-i:A)[a-z0-9_\\-]{34})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "telegr"
    ]
  },
  {
    "id": "telnyx-api-v2-key.1",
    "regex": "(?i:(?:telnyx(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(KEY[0-9A-Za-z_-]{55})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "telnyx"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "temporal-cloud-api-key.1",
    "regex": "\\b(eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]*Y2NvdW50X2lk[A-Za-z0-9_-]*InRlbXBvcmFsLmlv[A-Za-z0-9_-]*(?:ICJrZXlfaWQiOi|a2V5X2lk|rZXlfaWQi)[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "inrlbxbvcmfslmlv"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.2,
        "isInclusive": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^(?:[^0-9]*[0-9]){3}"
        ],
        "isNegated": true
      }
    ]
  },
  {
    "id": "thunderstore-api-token.1",
    "regex": "\\b(tss_[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tss_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^(?:[^0-9]*[0-9]){2}"
        ],
        "isNegated": true
      }
    ]
  },
  {
    "id": "togetherai-api-key",
    "regex": "(?i)\\b(tgp_v1_[A-Za-z0-9_-]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tgp_v1_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "travisci-access-token",
    "regex": "(?i)(?:travis)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{22})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "travis"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twilio-api-key",
    "regex": "SK[0-9a-fA-F]{32}",
    "keywords": [
      "twilio"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "twitch-api-token",
    "regex": "(?i)(?:twitch)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitch"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twitter-access-secret",
    "regex": "(?i)(?:twitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{45})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twitter-access-token",
    "regex": "(?i)(?:twitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9]{15,25}-[a-zA-Z0-9]{20,40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twitter-api-key",
    "regex": "(?i)(?:twitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{25})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twitter-api-secret",
    "regex": "(?i)(?:twitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{50})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "twitter-bearer-token",
    "regex": "(?i)(?:twitter)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(A{22}[a-zA-Z0-9%]{80,100})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "twitter"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "typeform-api-token",
    "regex": "(?i)(?:typeform)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(tfp_[a-z0-9\\-_\\.=]{59})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "tfp_"
    ]
  },
  {
    "id": "unkey-root-key.1",
    "regex": "\\b(unkey_[A-Za-z0-9]{20,32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "unkey_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "[0-9]"
        ],
        "isNegated": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "[A-Z]"
        ],
        "isNegated": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "[a-z]"
        ],
        "isNegated": true
      }
    ]
  },
  {
    "id": "upcloud-api-token",
    "regex": "\\b(ucat_[0-9A-Za-z]{24,32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "ucat_"
    ]
  },
  {
    "id": "upstage-api-key",
    "regex": "(?i)(?:upstage)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{40,50})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "upstage"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "upstash-redis-rest-token.1",
    "regex": "(?i:(?:upstash)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:[A-Za-z0-9]{32,48}|AYNgAS[A-Za-z0-9+/_-]{26,90}={0,2}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "upstash"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "upstash-redis-rest-url.1"
    ]
  },
  {
    "id": "upstash-redis-rest-url.1",
    "regex": "(?i)\\b(https://[a-z0-9][a-z0-9-]{2,63}\\.upstash\\.io)(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "upstash.io"
    ],
    "skipReport": true
  },
  {
    "id": "val-town-api-token.1",
    "regex": "\\b(vtwn_[A-Za-z0-9_-]{20,80})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vtwn_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "^(?:[^0-9]*[0-9]){2}"
        ],
        "isNegated": true
      }
    ]
  },
  {
    "id": "vault-batch-token",
    "regex": "\\b(hvb\\.[\\w-]{138,300})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hvb."
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "vault-service-token",
    "regex": "\\b((?:hvs\\.[\\w-]{90,120}|s\\.(?i:[a-z0-9]{24})))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "hvs.",
      "vault"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "s\\.[A-Za-z]{24}"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "vercel-ai-gateway-key",
    "regex": "(?i)\\b(vck_[A-Za-z0-9_-]{56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vck_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vercel-api-token",
    "regex": "(?i)(?:vercel)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Z0-9]{24})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vercel"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vercel-app-access-token",
    "regex": "(?i)\\b(vca_[A-Za-z0-9_-]{56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vca_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vercel-app-refresh-token",
    "regex": "(?i)\\b(vcr_[A-Za-z0-9_-]{56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vcr_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vercel-integration-token",
    "regex": "(?i)\\b(vci_[A-Za-z0-9_-]{56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vci_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vercel-personal-access-token",
    "regex": "(?i)\\b(vcp_[A-Za-z0-9_-]{56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vcp_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "virustotal-api-key.1",
    "regex": "(?i)(?:virustotal)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "virustotal"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "voyageai-api-key",
    "regex": "(?i:(?:voyage)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:pa|al)-[A-Za-z0-9_-]{43})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "voyage"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "vultr-api-key.1",
    "regex": "(?i)(?:vultr)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{36})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "vultr"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "wakatime-api-key.1",
    "regex": "(?i:(?:waka[_. -]?time(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wakatime",
      "waka_time",
      "waka-time",
      "waka time",
      "waka.time"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "wakatime-api-key.2",
    "regex": "(?i)\\b(waka_[a-z0-9]{36,64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "waka_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "weatherstack-api-key.1",
    "regex": "(?i:(?:weatherstack(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([0-9a-z]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "weatherstack"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "weights-and-biases-api-key",
    "regex": "(?i)(?:wandb|weightsandbiases)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wandb",
      "weightsandbiases"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "weights-and-biases-api-key-v1",
    "regex": "(?i)\\b(wandb_v1_[A-Za-z0-9_]{77})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wandb_v1_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "wiz-client-id.1",
    "regex": "(?i:(?:wiz)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{53,56})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wiz"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "wiz-client-secret.1",
    "regex": "(?i:(?:wiz)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([A-Za-z0-9]{64})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wiz"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ],
    "components": [
      "wiz-client-id.1"
    ]
  },
  {
    "id": "woocommerce-consumer-secret.1",
    "regex": "(?i)(?:woo)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(cs_[a-f0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wooc",
      "woo-",
      "woo_",
      "cs_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "workato-developer-api-token.1",
    "regex": "\\b(wrka(?:[a-z]{2})?-eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{64,})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "wrka"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 4,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "workos-production-api-key.1",
    "regex": "(?i:(?:workos(?:[_. -]*(?:api))?[_. -]*(?:secret|key|token))(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3})(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(sk_live_a2V5Xz[A-Za-z0-9+/]{69}={0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "workos"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      },
      {
        "kind": "matches",
        "target": "secret",
        "patterns": [
          "(?i)example"
        ],
        "isNegated": false
      }
    ]
  },
  {
    "id": "xai-api-key",
    "regex": "(?i)\\b(xai-[A-Za-z0-9_-]{70,120})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "xai-"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "xendit-production-api-key.1",
    "regex": "\\b(xnd_production_[A-Za-z0-9]{56,72})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "xnd_production_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "yandex-access-token",
    "regex": "(?i)(?:yandex)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(t1\\.[A-Z0-9a-z_-]+[=]{0,2}\\.[A-Z0-9a-z_-]{86}[=]{0,2})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "yandex"
    ]
  },
  {
    "id": "yandex-api-key",
    "regex": "(?i)(?:yandex)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(AQVN[A-Za-z0-9_\\-]{35,38})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "yandex"
    ]
  },
  {
    "id": "yandex-aws-access-token",
    "regex": "(?i)(?:yandex)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(YC[a-zA-Z0-9_\\-]{38})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "yandex"
    ]
  },
  {
    "id": "zai-api-key",
    "regex": "(?i)(?:zai|z_ai|z\\.ai|glm|zlm)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{32}\\.[a-z0-9]{16})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zai",
      "z_ai",
      "z.ai",
      "glm",
      "zlm"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": true
      }
    ]
  },
  {
    "id": "zendesk-secret-key",
    "regex": "(?i)(?:zendesk)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-z0-9]{40})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zendesk"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "zoho-client-id.1",
    "regex": "(?i)(?:zoho)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(1000\\.[a-z0-9]{30})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zoho"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3,
        "isInclusive": false
      }
    ],
    "skipReport": true
  },
  {
    "id": "zoho-client-secret.1",
    "regex": "(?i)(?:zoho)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}([a-f0-9]{42})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zoho"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ],
    "components": [
      "zoho-client-id.1"
    ]
  },
  {
    "id": "zoho-oauth-token.1",
    "regex": "(?i)(?:zoho)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}(1000\\.[a-f0-9]{32}\\.[a-f0-9]{32})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zoho"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "zoho-zapi-key.1",
    "regex": "(?i)(?:zoho)(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\\x60'\"\\s=]{0,5}((?:1001\\.[a-f0-9]{32}\\.[a-f0-9]{32}(?:-d)?|1003\\.[a-f0-9]{32,64}))(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zoho"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.5,
        "isInclusive": false
      }
    ]
  },
  {
    "id": "zuplo-consumer-api-key.1",
    "regex": "\\b(zpka_[a-z0-9]{32}_[0-9a-f]{8})(?:\\\\?['\"\\x60]|[\\s;]|\\\\[nr]|$)",
    "keywords": [
      "zpka_"
    ],
    "filter": [
      {
        "kind": "entropy",
        "limit": 3.3,
        "isInclusive": false
      }
    ]
  }
] satisfies readonly Rule[];
