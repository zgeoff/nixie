const recalledVersion = {
  type: 'object',
  properties: {
    change: { type: 'string' },
    state: { type: 'string' },
    text: { type: 'string' },
    about: {
      type: 'string',
      description:
        'where the version came from: its ID and version, its date, who noted it, what backs it ' +
        'and who confirmed it, and for a past version the version that replaced it',
    },
    quote: { type: 'string', description: 'the words the version came from' },
    image: {
      type: 'object',
      description:
        "the owner's photo the version came from: the eventID of the message that holds it and " +
        'its number, which log.read_image opens',
      properties: { eventID: { type: 'string' }, number: { type: 'integer' } },
      required: ['eventID', 'number'],
    },
    model: { type: ['string', 'null'], description: 'the model that wrote the version' },
  },
  required: ['change', 'state', 'text', 'about', 'model'],
};

export const recallOutputSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        ...recalledVersion,
        properties: {
          ...recalledVersion.properties,
          version: {
            type: 'integer',
            description:
              'the number to pass back as the version of memory.edit, retire, pin and unpin',
          },
          gist: { type: 'string', description: 'a one-line summary of the item' },
          topic: { type: 'string', description: 'the topic the item belongs to' },
          triggers: {
            type: 'array',
            items: { type: 'string' },
            description: 'the phrases that bring the item up',
          },
          itemID: { type: 'string' },
          usage: {
            type: 'string',
            description:
              'how often searches and pushes surfaced the item, when it last surfaced and when ' +
              'you last recalled it by ID',
          },
          isPinned: { type: 'boolean' },
          subject: {
            type: 'string',
            enum: ['owner', 'self', 'shared'],
            description:
              'owner for a fact about the owner, shared for something between the owner and you, such as ' +
              'a deal, a nickname or a running joke, self for a self-note you wrote about yourself',
          },
          disputedBy: {
            type: 'integer',
            description: 'how many notes in your notebook dispute the item; left out at 0',
          },
          supersededBy: {
            type: 'integer',
            description: 'how many notes in your notebook supersede the item; left out at 0',
          },
          history: {
            type: 'array',
            items: {
              ...recalledVersion,
              properties: {
                ...recalledVersion.properties,
                textVersion: { type: 'integer' },
              },
              required: [...recalledVersion.required, 'textVersion'],
            },
          },
          labelHistory: {
            type: 'array',
            description: 'every label set the item has had, oldest first',
            items: {
              type: 'object',
              properties: {
                revision: { type: 'integer' },
                gist: { type: 'string' },
                topic: { type: 'string' },
                triggers: { type: 'array', items: { type: 'string' } },
              },
              required: ['revision', 'gist', 'topic', 'triggers'],
              additionalProperties: false,
            },
          },
          moments: {
            type: 'array',
            description: 'the moments linked to the item, each by its momentID and title',
            items: {
              type: 'object',
              properties: { momentID: { type: 'string' }, title: { type: 'string' } },
              required: ['momentID', 'title'],
            },
          },
        },
        required: [
          ...recalledVersion.required,
          'version',
          'gist',
          'topic',
          'triggers',
          'itemID',
          'usage',
          'isPinned',
          'subject',
        ],
      },
    },
    lines: {
      type: 'array',
      description: 'the items under the topic, each by its ID and gist',
      items: {
        type: 'object',
        properties: {
          itemID: { type: 'string' },
          gist: { type: 'string' },
          subject: { type: 'string', enum: ['owner', 'self', 'shared'] },
        },
        required: ['itemID', 'gist', 'subject'],
        additionalProperties: false,
      },
    },
    topics: {
      type: 'array',
      description: 'every topic of the memory index with its subject and item count',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          subject: { type: 'string', enum: ['owner', 'self', 'shared'] },
          items: { type: 'integer' },
        },
        required: ['topic', 'subject', 'items'],
        additionalProperties: false,
      },
    },
    next: { type: ['string', 'null'] },
    searched: {
      type: 'object',
      description:
        'the search of the call, copied: its query, itemIDs, topic or topics, and its subjects',
      properties: {
        query: { type: 'string' },
        itemIDs: { type: 'array', items: { type: 'string' } },
        topic: { type: 'string' },
        topics: { type: 'boolean' },
        subjects: { type: 'array', items: { type: 'string', enum: ['owner', 'self', 'shared'] } },
      },
      additionalProperties: false,
    },
    leftOut: {
      type: 'object',
      description: 'what the page leaves out because it is capped in size',
      properties: {
        count: { type: 'integer', description: 'the items the result leaves out' },
        itemIDs: {
          type: 'array',
          items: { type: 'string' },
          description: 'the IDs of the items left out, to recall',
        },
        versions: {
          type: 'integer',
          description:
            'the past versions and past label revisions of the first item that the result leaves out',
        },
      },
      required: ['count', 'itemIDs', 'versions'],
      additionalProperties: false,
    },
  },
  required: ['searched'],
  anyOf: [{ required: ['items'] }, { required: ['lines'] }, { required: ['topics'] }],
  additionalProperties: false,
};
