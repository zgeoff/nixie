## Programs

| Image                | Program | Code runs | Right | Total median | Total p90 | Program median | Program p90 |
| -------------------- | ------- | --------: | ----: | -----------: | --------: | -------------: | ----------: |
| spike-ce-code        | node    |         5 |     5 |          388 |       459 |             76 |          82 |
| spike-ce-code        | python  |         5 |     5 |          339 |       405 |             22 |          23 |
| spike-ce-code        | shell   |         5 |     5 |          299 |       378 |              8 |           9 |
| spike-ce-worker      | node    |         5 |     5 |          402 |       452 |             77 |          85 |
| spike-ce-worker      | python  |         5 |     5 |          338 |       399 |             23 |          26 |
| spike-ce-worker      | shell   |         5 |     5 |          330 |       392 |              9 |          12 |
| spike-ce-size-no-npm | node    |         5 |     5 |          433 |       517 |             74 |          79 |
| spike-ce-size-no-npm | python  |         5 |     5 |          376 |       451 |             22 |          24 |
| spike-ce-size-no-npm | shell   |         5 |     5 |          360 |       396 |              8 |           8 |

## Probes

| Image                | Probe                   | Exit | Program ms | Error or last line                                                                            |
| -------------------- | ----------------------- | ---: | ---------: | --------------------------------------------------------------------------------------------- |
| spike-ce-code        | node version            |    0 |         13 | v20.19.2                                                                                      |
| spike-ce-code        | npm version             |    0 |        241 | 9.2.0                                                                                         |
| spike-ce-code        | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-code        | pip version             |    0 |        101 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-code        | toolbox versions        |    0 |         14 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-code        | node start              |    0 |         60 |                                                                                               |
| spike-ce-code        | python start            |    0 |          9 |                                                                                               |
| spike-ce-code        | node standard modules   |    0 |         66 |                                                                                               |
| spike-ce-code        | node sqlite             |    1 |         62 | Node.js v20.19.2                                                                              |
| spike-ce-code        | python standard modules |    0 |         29 |                                                                                               |
| spike-ce-code        | python numpy            |    1 |         17 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-code        | python pandas           |    1 |         16 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-code        | python requests         |    1 |         16 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-code        | node lodash             |    0 |         59 |                                                                                               |
| spike-ce-code        | pip install             |    1 |        154 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-code        | pip install in a venv   |    1 |       1234 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-code        | npm install             |    1 |        294 | npm ERR! code EAI_AGAIN                                                                       |
| spike-ce-code        | curl                    |    6 |          6 | curl: (6) Could not resolve host: example.com                                                 |
| spike-ce-worker      | node version            |    0 |         14 | v20.19.2                                                                                      |
| spike-ce-worker      | npm version             |    0 |        230 | 9.2.0                                                                                         |
| spike-ce-worker      | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-worker      | pip version             |    0 |         95 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-worker      | toolbox versions        |    0 |         18 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-worker      | node start              |    0 |         50 |                                                                                               |
| spike-ce-worker      | python start            |    0 |          8 |                                                                                               |
| spike-ce-worker      | node standard modules   |    0 |         61 |                                                                                               |
| spike-ce-worker      | node sqlite             |    1 |         58 | Node.js v20.19.2                                                                              |
| spike-ce-worker      | python standard modules |    0 |         28 |                                                                                               |
| spike-ce-worker      | python numpy            |    1 |         16 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-worker      | python pandas           |    1 |         19 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-worker      | python requests         |    1 |         17 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-worker      | node lodash             |    0 |         60 |                                                                                               |
| spike-ce-worker      | pip install             |    1 |        150 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-worker      | pip install in a venv   |    1 |       1226 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-worker      | npm install             |    1 |        272 | npm ERR! code EAI_AGAIN                                                                       |
| spike-ce-worker      | curl                    |    6 |          6 | curl: (6) Could not resolve host: example.com                                                 |
| spike-ce-size-no-npm | node version            |    0 |         13 | v20.19.2                                                                                      |
| spike-ce-size-no-npm | npm version             |  127 |          1 | bash: line 1: npm: command not found                                                          |
| spike-ce-size-no-npm | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-size-no-npm | pip version             |    0 |         96 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-size-no-npm | toolbox versions        |    0 |         12 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-size-no-npm | node start              |    0 |         51 |                                                                                               |
| spike-ce-size-no-npm | python start            |    0 |          8 |                                                                                               |
| spike-ce-size-no-npm | node standard modules   |    0 |         64 |                                                                                               |
| spike-ce-size-no-npm | node sqlite             |    1 |         59 | Node.js v20.19.2                                                                              |
| spike-ce-size-no-npm | python standard modules |    0 |         28 |                                                                                               |
| spike-ce-size-no-npm | python numpy            |    1 |         21 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-size-no-npm | python pandas           |    1 |         18 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-size-no-npm | python requests         |    1 |         18 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-size-no-npm | node lodash             |    1 |         57 | Node.js v20.19.2                                                                              |
| spike-ce-size-no-npm | pip install             |    1 |        144 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-size-no-npm | pip install in a venv   |    1 |       1196 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-size-no-npm | npm install             |  127 |          1 | bash: line 1: npm: command not found                                                          |
| spike-ce-size-no-npm | curl                    |    6 |          6 | curl: (6) Could not resolve host: example.com                                                 |
