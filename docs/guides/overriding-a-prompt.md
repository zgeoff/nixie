# Overriding a prompt

Replace part of one of nixie's built-in prompts, or rearrange its parts, from your definitions repo.
Anything you leave unset keeps nixie's built-in text. [Prompts](../architecture/core/prompts.md)
covers how nixie renders a prompt and what the seed checks.

## Before you start

- A checkout of your definitions repo whose `nixie.yaml` holds `format: 3`. Format 2 loads, and
  lists every override file as unapplied.

## Steps

1. Write the new text of a part in a file under `prompts/`, such as `prompts/writer-instruction.md`.
   A `{{ path }}` slot in the text takes a value from the tables under
   [Parts and paths](#parts-and-paths).
2. Name the file in the `prompts:` map of `nixie.yaml`, under the prompt and the part it replaces:

   ```yaml
   format: 3
   prompts:
     writer:
       instruction: prompts/writer-instruction.md
   ```

3. To rearrange the parts, add an inline `_template` under the prompt:

   ```yaml
   prompts:
     compaction:
       _template: |
         {{ parts.instruction }}
         {{ parts.safety }}
   ```

4. Merge the change and let nixie seed the definitions. Expect a `definitions.seeded` line with
   `status` `seeded` in the operator log. A `status` of `refused` carries an error that holds the
   file's path and the fault.
5. When an override replaces a `safety` part or leaves `{{ parts.safety }}` out of a template,
   expect a `prompts.safety_missing` line in the operator log that lists each such prompt. That line
   is the one sign that a prompt runs without its built-in safety rules.

## Parts and paths

A template reads `parts.<name>` for each part of its prompt, and every path in its row. A part reads
every path in its row and the parts listed before it.

| Prompt               | Parts                                          | Paths                                                                                                             |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `writer`             | `persona`, `instruction`, `safety`             | `persona`, `owner.name`, `owner.label`, `owner.mention`, `assistant.name`, `assistant.label`, `assistant.mention` |
| `consolidator`       | `persona`, `nameRule`, `instruction`, `safety` | `persona`, `owner.name`, `memory.maxChanges`                                                                      |
| `content-checker`    | `nameRule`, `instruction`, `safety`            | `owner.name`, `owner.nameAtSentenceStart`                                                                         |
| `retirement-checker` | `instruction`, `safety`                        | none                                                                                                              |
| `session`            | `skillCatalog`, `instruction`, `safety`        | `persona`, `skillCatalog`, `owner.name`                                                                           |
| `compaction`         | `instruction`, `safety`                        | `owner.name`, `owner.nameAtSentenceStart`, `summary.words`                                                        |

Each path holds one value:

| Path                        | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `persona`                   | The persona in force                                           |
| `skillCatalog`              | The catalog of skills the conversation may load, or empty text |
| `owner.name`                | Your configured name, or "the owner"                           |
| `owner.nameAtSentenceStart` | The same name with a capital first letter                      |
| `owner.label`               | The author label on your messages, such as `Avery (owner)`     |
| `owner.mention`             | The words a memory uses for you, such as `the owner "Avery"`   |
| `assistant.name`            | The assistant's configured name, or "the assistant"            |
| `assistant.label`           | The author label on the assistant's messages                   |
| `assistant.mention`         | The words a shared memory uses for the assistant               |
| `memory.maxChanges`         | The most changes one consolidation may propose                 |
| `summary.words`             | The word target of a compaction summary                        |

A part with a condition renders as empty text when its condition fails, whatever its text: `persona`
when no persona is in force, `nameRule` when no name is configured, and `skillCatalog` when the
conversation has no skills.
