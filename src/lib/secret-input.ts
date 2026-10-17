import * as readline from 'node:readline'
import { Writable } from 'node:stream'

type InputStream = NodeJS.ReadableStream & { isTTY?: boolean }
type OutputStream = Pick<NodeJS.WritableStream, 'write'>

/**
 * Prompt for a secret without echoing keystrokes.
 *
 * readline is given a muted sink as its output, so its echo goes nowhere while the
 * prompt itself is written to the real output. (The previous version overwrote
 * `rl.output.write`, which is `process.stdout.write` itself, silencing all later
 * stdout output for the rest of the process.)
 */
export function promptSecret(
  prompt: string,
  input: InputStream = process.stdin,
  output: OutputStream = process.stdout
): Promise<string> {
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const rl = readline.createInterface({ input, output: muted, terminal: Boolean(input.isTTY) })

  output.write(prompt)
  return new Promise((resolve, reject) => {
    rl.on('SIGINT', () => {
      rl.close()
      output.write('\n')
      reject(new Error('Cancelled.'))
    })
    rl.question('', (answer) => {
      rl.close()
      output.write('\n')
      resolve(answer)
    })
  })
}

/** Read a secret piped on stdin, e.g. `printf %s "$VAL" | arbiter vault set ...`. */
export function readSecretFromStream(input: NodeJS.ReadableStream = process.stdin): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    input.setEncoding('utf-8')
    input.on('data', (chunk: string) => (data += chunk))
    input.on('end', () => resolve(data.trim()))
    input.on('error', reject)
  })
}
