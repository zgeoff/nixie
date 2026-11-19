### attribution-closed-backend

attribution-plan-backend, with chatgpt_base_url at a closed loopback port in place of the stub

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 114   | -      |

### attribution-plan-backend

production-plan-backend, with an account whose settings turn on commit attribution

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] developer text                          | Codex       | 1125  | 235    |
| input[2] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 537   | -      |
| state folder path, replaced in the recorded body | metadata    | 112   | -      |

### before-plan-backend

before, on a plan login, with the ChatGPT backend pointed at the stub

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 628   | 122    |
| tool list_mcp_resource_templates                 | Codex       | 717   | 133    |
| tool read_mcp_resource                           | Codex       | 526   | 114    |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1211  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 107   | -      |

### before

the config and catalog the guest wrote before this spike, with an API key

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 628   | 122    |
| tool list_mcp_resource_templates                 | Codex       | 717   | 133    |
| tool read_mcp_resource                           | Codex       | 526   | 114    |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1211  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 94    | -      |

### bundled-catalog

production, without nixie's model catalog, so the CLI uses its bundled entry

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] additional_tools                        | Codex       | 9448  | 2446   |
| input[1] developer text                          | nixie       | 903   | 198    |
| input[2] user text                               | nixie       | 43    | 10     |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 5     | -      |
| reasoning                                        | metadata    | 38    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| text                                             | metadata    | 19    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 400   | -      |
| state folder path, replaced in the recorded body | metadata    | 103   | -      |

### capture-tag

production, with a capture tag in the base URL's path, as a turn-input capture sets

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 99    | -      |

### production-plan-backend

production, on a plan login, with the ChatGPT backend pointed at the stub

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 111   | -      |

### production-plan

production, on a plan login, with the ChatGPT backend left at chatgpt.com

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 103   | -      |

### production

the config and catalog the guest writes, with an API key

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 98    | -      |

### tool-call

production, with a first reply that calls time.now, so a second request follows

Request 1

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 409   | -      |
| state folder path, replaced in the recorded body | metadata    | 97    | -      |

Request 2

| Part                                             | Source      | Bytes | Tokens |
| ------------------------------------------------ | ----------- | ----- | ------ |
| model                                            | metadata    | 12    | -      |
| stream                                           | metadata    | 4     | -      |
| input[0] developer text                          | nixie       | 903   | 198    |
| input[1] user text                               | nixie       | 43    | 10     |
| input[2] function_call                           | model       | 106   | 31     |
| input[3] tool result header                      | Codex       | 36    | 12     |
| input[3] tool result                             | nixie       | 63    | 24     |
| tool list_mcp_resources                          | Codex       | 126   | 29     |
| tool list_mcp_resource_templates                 | Codex       | 135   | 30     |
| tool read_mcp_resource                           | Codex       | 125   | 29     |
| tool mcp__nixie wrapper                          | Codex       | 102   | 31     |
| tool mcp__nixie.task_message                     | nixie       | 1530  | 355    |
| tool mcp__nixie.task_report                      | nixie       | 579   | 129    |
| tool mcp__nixie.tasks_list                       | nixie       | 1623  | 363    |
| tool mcp__nixie.time_now                         | nixie       | 664   | 148    |
| tool mcp__nixie.turn_end_silently                | nixie       | 445   | 101    |
| tool_choice                                      | metadata    | 6     | -      |
| parallel_tool_calls                              | metadata    | 4     | -      |
| reasoning                                        | metadata    | 33    | -      |
| store                                            | metadata    | 5     | -      |
| include                                          | metadata    | 31    | -      |
| prompt_cache_key                                 | metadata    | 38    | -      |
| client_metadata                                  | metadata    | 1212  | -      |
| braces, commas and keys                          | JSON syntax | 583   | -      |
| state folder path, replaced in the recorded body | metadata    | 97    | -      |

### Summary

| Request                       | Body bytes | Codex bytes the model reads | Codex tokens | nixie bytes | nixie tokens |
| ----------------------------- | ---------- | --------------------------- | ------------ | ----------- | ------------ |
| attribution-closed-backend #1 | 8143       | 488                         | 119          | 5787        | 1304         |
| attribution-plan-backend #1   | 9394       | 1613                        | 354          | 5787        | 1304         |
| before-plan-backend #1        | 9620       | 1973                        | 400          | 5787        | 1304         |
| before #1                     | 9607       | 1973                        | 400          | 5787        | 1304         |
| bundled-catalog #1            | 12267      | 9448                        | 2446         | 946         | 208          |
| capture-tag #1                | 8128       | 488                         | 119          | 5787        | 1304         |
| production-plan-backend #1    | 8140       | 488                         | 119          | 5787        | 1304         |
| production-plan #1            | 8132       | 488                         | 119          | 5787        | 1304         |
| production #1                 | 8127       | 488                         | 119          | 5787        | 1304         |
| tool-call #1                  | 8126       | 488                         | 119          | 5787        | 1304         |
| tool-call #2                  | 8505       | 524                         | 131          | 5850        | 1328         |
