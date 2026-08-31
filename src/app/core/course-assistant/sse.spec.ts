import { createSseParser } from './sse';

describe('createSseParser', () => {
  it('parses complete SSE blocks into typed events', () => {
    const parser = createSseParser();
    const events = parser.push(
      'event: token\ndata: {"delta":"Bon"}\n\n' +
        'event: thinking\ndata: {"delta":"hmm"}\n\n' +
        'event: done\ndata: {"usage":null,"user_message_id":"u1","message_ids":[],"sources":{},"title":null}\n\n',
    );
    expect(events).toEqual([
      { type: 'token', delta: 'Bon' },
      { type: 'thinking', delta: 'hmm' },
      {
        type: 'done',
        usage: null,
        user_message_id: 'u1',
        message_ids: [],
        sources: {},
        title: null,
      },
    ]);
  });

  it('buffers events split across chunks', () => {
    const parser = createSseParser();
    expect(parser.push('event: tok')).toEqual([]);
    expect(parser.push('en\ndata: {"del')).toEqual([]);
    expect(parser.push('ta":"jour"}\n\nevent: token\ndata: {"delta":" !"}')).toEqual([
      { type: 'token', delta: 'jour' },
    ]);
    expect(parser.push('\n\n')).toEqual([{ type: 'token', delta: ' !' }]);
  });

  it('parses tool events and errors', () => {
    const parser = createSseParser();
    const events = parser.push(
      'event: tool_call\ndata: {"id":"c1","name":"read_block","args":{"block_id":"b"}}\n\n' +
        'event: tool_result\ndata: {"id":"c1","name":"read_block","is_error":true}\n\n' +
        'event: error\ndata: {"status":503,"detail":"Injoignable"}\n\n',
    );
    expect(events[0]).toEqual({
      type: 'tool_call',
      id: 'c1',
      name: 'read_block',
      args: { block_id: 'b' },
    });
    expect(events[1]).toEqual({
      type: 'tool_result',
      id: 'c1',
      name: 'read_block',
      is_error: true,
    });
    expect(events[2]).toEqual({ type: 'error', status: 503, detail: 'Injoignable' });
  });

  it('ignores unknown events and malformed JSON (contrat additif)', () => {
    const parser = createSseParser();
    const events = parser.push(
      'event: nouveau_type\ndata: {"x":1}\n\n' +
        'event: token\ndata: pas-du-json\n\n' +
        'event: token\ndata: {"delta":"ok"}\n\n',
    );
    expect(events).toEqual([{ type: 'token', delta: 'ok' }]);
  });
});
