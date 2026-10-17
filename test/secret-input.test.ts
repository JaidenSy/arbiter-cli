import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { promptSecret, readSecretFromStream } from '../src/lib/secret-input.js'

function collector() {
  let text = ''
  const write = (chunk: string | Uint8Array): boolean => {
    text += chunk.toString()
    return true
  }
  return { out: { write }, write, text: () => text }
}

describe('promptSecret', () => {
  it.each([true, false])('returns the typed value without echoing it (isTTY=%s)', async (isTTY) => {
    const input = Object.assign(new PassThrough(), { isTTY })
    const sink = collector()

    const pending = promptSecret('Secret value for KEY: ', input, sink.out)
    input.write('hunter2\n')

    await expect(pending).resolves.toBe('hunter2')
    expect(sink.text()).toBe('Secret value for KEY: \n')
    expect(sink.text()).not.toContain('hunter2')
  })

  it('does not monkeypatch the output stream', async () => {
    const input = new PassThrough()
    const sink = collector()
    const pending = promptSecret('> ', input, sink.out)
    input.write('x\n')
    await pending
    // The old implementation replaced output.write (i.e. process.stdout.write) with a
    // no-op, which silenced every later line the CLI printed.
    expect(sink.out.write).toBe(sink.write)
  })
})

describe('readSecretFromStream', () => {
  it('reads piped stdin to EOF and trims the trailing newline', async () => {
    const input = new PassThrough()
    const pending = readSecretFromStream(input)
    input.write('s3cr')
    input.end('3t\n')
    await expect(pending).resolves.toBe('s3cr3t')
  })

  it('returns an empty string for empty input', async () => {
    const input = new PassThrough()
    const pending = readSecretFromStream(input)
    input.end()
    await expect(pending).resolves.toBe('')
  })
})
