## Programs

| Image           | Program | Code runs | Right | Total median | Total p90 | Program median | Program p90 |
| --------------- | ------- | --------: | ----: | -----------: | --------: | -------------: | ----------: |
| spike-ce-code   | node    |         5 |     5 |          358 |       391 |             72 |          82 |
| spike-ce-code   | python  |         5 |     5 |          311 |       321 |             22 |          24 |
| spike-ce-code   | shell   |         5 |     5 |          301 |       346 |              8 |           9 |
| spike-ce-worker | node    |         5 |     5 |          387 |       505 |             73 |         173 |
| spike-ce-worker | python  |         5 |     5 |          309 |       362 |             22 |          46 |
| spike-ce-worker | shell   |         5 |     5 |          310 |       326 |              8 |          20 |
| spike-ce-no-npm | node    |         5 |     5 |          390 |       419 |             75 |          79 |
| spike-ce-no-npm | python  |         5 |     5 |          326 |       382 |             21 |          24 |
| spike-ce-no-npm | shell   |         5 |     5 |          305 |       323 |              8 |           9 |

## Probes

| Image           | Probe                   | Exit | Program ms | Error or last line                                                                            |
| --------------- | ----------------------- | ---: | ---------: | --------------------------------------------------------------------------------------------- |
| spike-ce-code   | node version            |    0 |         14 | v20.19.2                                                                                      |
| spike-ce-code   | npm version             |    0 |        226 | 9.2.0                                                                                         |
| spike-ce-code   | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-code   | pip version             |    0 |         93 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-code   | toolbox versions        |    0 |         13 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-code   | node start              |    0 |         51 |                                                                                               |
| spike-ce-code   | python start            |    0 |          8 |                                                                                               |
| spike-ce-code   | node standard modules   |    0 |         62 |                                                                                               |
| spike-ce-code   | node sqlite             |    1 |         58 | Node.js v20.19.2                                                                              |
| spike-ce-code   | python standard modules |    0 |         28 |                                                                                               |
| spike-ce-code   | python numpy            |    1 |         15 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-code   | python pandas           |    1 |         15 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-code   | python requests         |    1 |         15 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-code   | node lodash             |    0 |         58 |                                                                                               |
| spike-ce-code   | user                    |    0 |          2 | code                                                                                          |
| spike-ce-code   | node libraries          |    0 |          3 | 896                                                                                           |
| spike-ce-code   | pip install             |    1 |        138 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-code   | pip install in a venv   |    1 |       1125 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-code   | npm install             |    1 |        257 | npm ERR! code EAI_AGAIN                                                                       |
| spike-ce-code   | curl                    |    6 |          6 | curl: (6) Could not resolve host: example.com                                                 |
| spike-ce-worker | node version            |    0 |         16 | v20.19.2                                                                                      |
| spike-ce-worker | npm version             |    0 |        257 | 9.2.0                                                                                         |
| spike-ce-worker | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-worker | pip version             |    0 |        118 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-worker | toolbox versions        |    0 |         26 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-worker | node start              |    0 |         50 |                                                                                               |
| spike-ce-worker | python start            |    0 |          8 |                                                                                               |
| spike-ce-worker | node standard modules   |    0 |         61 |                                                                                               |
| spike-ce-worker | node sqlite             |    1 |         55 | Node.js v20.19.2                                                                              |
| spike-ce-worker | python standard modules |    0 |         29 |                                                                                               |
| spike-ce-worker | python numpy            |    1 |         15 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-worker | python pandas           |    1 |         15 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-worker | python requests         |    1 |         15 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-worker | node lodash             |    0 |         59 |                                                                                               |
| spike-ce-worker | user                    |    0 |          8 | nixie                                                                                         |
| spike-ce-worker | node libraries          |    0 |          5 | 896                                                                                           |
| spike-ce-worker | pip install             |    1 |        155 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-worker | pip install in a venv   |    1 |       1138 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-worker | npm install             |    1 |        263 | npm ERR! code EAI_AGAIN                                                                       |
| spike-ce-worker | curl                    |    6 |          6 | curl: (6) Could not resolve host: example.com                                                 |
| spike-ce-no-npm | node version            |    0 |         14 | v20.19.2                                                                                      |
| spike-ce-no-npm | npm version             |  127 |          1 | bash: line 1: npm: command not found                                                          |
| spike-ce-no-npm | python version          |    0 |          2 | Python 3.13.5                                                                                 |
| spike-ce-no-npm | pip version             |    0 |         89 | pip 25.1.1 from /usr/lib/python3/dist-packages/pip (python 3.13)                              |
| spike-ce-no-npm | toolbox versions        |    0 |         11 | GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)                                     |
| spike-ce-no-npm | node start              |    0 |         50 |                                                                                               |
| spike-ce-no-npm | python start            |    0 |          8 |                                                                                               |
| spike-ce-no-npm | node standard modules   |    0 |         62 |                                                                                               |
| spike-ce-no-npm | node sqlite             |    1 |         58 | Node.js v20.19.2                                                                              |
| spike-ce-no-npm | python standard modules |    0 |         28 |                                                                                               |
| spike-ce-no-npm | python numpy            |    1 |         16 | ModuleNotFoundError: No module named 'numpy'                                                  |
| spike-ce-no-npm | python pandas           |    1 |         15 | ModuleNotFoundError: No module named 'pandas'                                                 |
| spike-ce-no-npm | python requests         |    1 |         15 | ModuleNotFoundError: No module named 'requests'                                               |
| spike-ce-no-npm | node lodash             |    1 |         57 | Node.js v20.19.2                                                                              |
| spike-ce-no-npm | user                    |    0 |          2 | code                                                                                          |
| spike-ce-no-npm | node libraries          |    0 |          2 | 27                                                                                            |
| spike-ce-no-npm | pip install             |    1 |        138 | hint: See PEP 668 for the detailed specification.                                             |
| spike-ce-no-npm | pip install in a venv   |    1 |       1134 | ERROR: Could not find a version that satisfies the requirement requests (from versions: none) |
| spike-ce-no-npm | npm install             |  127 |          1 | bash: line 1: npm: command not found                                                          |
| spike-ce-no-npm | curl                    |    6 |          5 | curl: (6) Could not resolve host: example.com                                                 |
