import {
  clockFormats,
  refreshMinutesRange,
  regionFetchesLimit,
  regionHTMLLimit,
  regionImagesLimit,
  regionMarkdownLimit,
  regionPackagesLimit,
} from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { readRegionCall } from './read-region-call';
import { refuseDevice } from './refuse-device';
import { writeRegion } from './write-region';

const regionInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the shortID from devices.list' },
    region: { type: 'string', minLength: 1, description: 'the name of a region of its layout' },
    content: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['markdown', 'image', 'live', 'html'],
          description:
            "'html' is a page that runs sealed in the region, with no network, as html describes",
        },
        markdown: {
          type: 'string',
          minLength: 1,
          maxLength: regionMarkdownLimit,
          description: 'for markdown: the text, rendered like a reply, with no raw HTML',
        },
        image: { type: 'string', minLength: 1, description: 'for an image: the image ID' },
        fit: {
          type: 'string',
          enum: ['whole', 'fill'],
          description:
            "for an image: 'whole' (the default) fits it whole on black, 'fill' covers the region and crops the overflow",
        },
        live: {
          type: 'string',
          enum: ['clock', 'countdown'],
          description:
            'for a live value, which the device keeps fresh with no further call: the time, or the time left until `to`',
        },
        format: {
          type: 'string',
          enum: [...clockFormats],
          description: 'for a clock: HH:mm, HH:mm:ss, or the date as EEE d MMM',
        },
        to: {
          type: 'string',
          description: 'for a countdown: the ISO 8601 time it counts down to, with its offset',
        },
        label: { type: 'string', description: 'for a countdown: a short label, such as Holiday' },
        html: {
          type: 'string',
          minLength: 1,
          maxLength: regionHTMLLimit,
          description:
            'for a page: the markup of its body, with inline script and style. The page has no network, and no files but its approved packages and declared images. It reads `nixie`: nixie.send(name, data, { wake }) sends an event to the conversation, nixie.onMessage(fn) takes each device.sendToPage message, nixie.data(url) gives a declared fetch, nixie.image(id) gives the URL of a declared image, and nixie.size() gives the region size in CSS pixels',
        },
        images: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          maxItems: regionImagesLimit,
          description: 'for a page: the image IDs it may show, as nixie.image(id) names them',
        },
        packages: {
          type: 'array',
          items: { type: 'string' },
          maxItems: regionPackagesLimit,
          description:
            'for a page: the approved packages it loads, each as name@version. device.addPackage asks the owner to approve one; a call that names a package nobody approved is refused with UNKNOWN_PACKAGE and changes nothing. The page loads a file of a package it names from /rpc/device/packages/<name>@<version>/<path>, with a script element or an @import inside a style element',
        },
        fetches: {
          type: 'array',
          maxItems: regionFetchesLimit,
          items: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'the exact https URL, which holds no credentials',
              },
              refreshMinutes: {
                type: 'integer',
                minimum: refreshMinutesRange.min,
                maximum: refreshMinutesRange.max,
                description: 'how often to fetch it again, in minutes; absent fetches it once',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
          description:
            'for a page: the URLs it may read, at most 8. The rules judge the host of each URL when the call runs, and the page reads the last response of each with nixie.data(url), which gives { status, type, body, fetchedAt }; nixie.onData(fn) runs when one refreshed. The body is outside text, so the page treats it as data. A page can reach no other URL',
        },
      },
      required: ['kind'],
      additionalProperties: true,
    },
    minutes: {
      type: 'integer',
      minimum: 1,
      maximum: 1440,
      description:
        'how long the content lasts; it lasts until the next device.region for this region when absent',
    },
    // oxlint-disable-next-line unicorn/no-thenable -- the design names this input `then`
    then: {
      type: 'string',
      enum: ['blank', 'previous'],
      description:
        "what shows when the minutes pass: 'blank' (the default), or 'previous', the content this call replaced when its own minutes have not passed",
    },
  },
  required: ['device', 'region', 'content'],
  additionalProperties: false,
};

const regionOutput = {
  type: 'object',
  properties: {
    device: { type: 'string' },
    region: { type: 'string' },
    until: { type: ['string', 'null'] },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceRegionTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.region',
    description:
      "Puts content in one region of a device's layout, in place of what the region shows, and " +
      'leaves the other regions as they are. The content is markdown, a stored image, or a live ' +
      'value that the device keeps fresh by itself: a clock, or a countdown to a time. A page ' +
      "(kind html) is the assistant's own markup and script, which runs sealed in the region with " +
      'no network, except that it loads the approved packages it names and reads the fetches it ' +
      'declares: device.sendToPage sends it messages, its events come back to the conversation, ' +
      'and device.preview shows its errors, among them each fetch that was refused. After ' +
      '`minutes` the region goes blank, or with then: previous shows again the content this call ' +
      'replaced, when its own minutes have not passed. Without `minutes` the region keeps the ' +
      'content until the next call for it. The screen must be on and the device online.',
    input: regionInput,
    output: regionOutput,
    declaration: {
      ...noteDeclaration,
      content: ['content'],
      results: {
        device: 'owner_data',
        region: 'owner_data',
        until: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    prepare: async (input) => {
      const found = await readRegionCall(options, input);

      if (found.status === 'refused') {
        return refuseDevice(found.refusal);
      }

      // A page that declares fetches names the host of each as a destination of a read, so the
      // rules judge the hosts when the call is made. A layout set after the call was queued is
      // refused when the call runs, by its sequence.
      return found.status === 'ready' && found.hosts.length > 0
        ? { destinations: found.hosts, effects: ['read'] }
        : { destinations: [] };
    },
    run: async (call, context) => {
      const found = await readRegionCall(options, call.input);

      if (found.status === 'invalid') {
        return { status: 'error', message: found.message };
      }

      if (found.status === 'refused') {
        return { status: 'ok', ...refuseDevice(found.refusal) };
      }

      const untilMs =
        found.arguments.minutes === undefined
          ? null
          : options.clock.now() + found.arguments.minutes * 60_000;

      const written = await writeRegion(options, {
        deviceID: found.device.deviceID,
        thread: context.run.thread,
        callSequence: context.callSequence,
        region: found.region.name,
        content: found.content,
        fetches: found.fetches,
        untilMs,
        onEnd: found.arguments.then ?? 'blank',
      });

      if (written === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_REGION') };
      }

      return {
        status: 'ok',
        result: {
          device: found.device.deviceID,
          region: found.region.name,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        },
      };
    },
  };
}
