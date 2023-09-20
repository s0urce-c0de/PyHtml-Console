function sleep(s) {
  return new Promise((resolve) => setTimeout(resolve, s));
}

async function main() {
  const urlParams = new URLSearchParams(window.location.search);
  let modules = urlParams.get('modules');
  if(modules==null){modules=''}
  modules = modules.split(',')
  const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/dev/full/pyodide.mjs");

  let term;
  globalThis.pyodide = await loadPyodide({
    stdin: () => {
      let result = prompt();
      echo(result);
      return result;
    },
  });
  let namespace = pyodide.globals.get("dict")();
  pyodide.runPython(
    `
      import sys
      from pyodide.ffi import to_js
      from pyodide.console import PyodideConsole, BANNER
      import __main__
      pyconsole = PyodideConsole(__main__.__dict__)
      import builtins
      async def await_fut(fut):
        res = await fut
        if res is not None:
          builtins._ = res
        return to_js([res], depth=1)
      def clear_console():
        pyconsole.buffer = []
  `,
    { globals: namespace },
  );
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip')
  if (modules != '') {for (let i=0; i < modules.length; i++) {
    await micropip.install(modules[i])
  }}
  let banner = namespace.get("BANNER");
  let await_fut = namespace.get("await_fut");
  let pyconsole = namespace.get("pyconsole");
  let clear_console = namespace.get("clear_console");
  const echo = (msg, ...opts) =>
    term.echo(
      msg
        .replaceAll("]]", "&rsqb;&rsqb;")
        .replaceAll("[[", "&lsqb;&lsqb;"),
      ...opts,
    );
  namespace.destroy();

  let ps1 = ">>> ",
    ps2 = "... ";

  async function lock() {
    let resolve;
    let ready = term.ready;
    term.ready = new Promise((res) => (resolve = res));
    await ready;
    return resolve;
  }

  async function interpreter(command) {
    let unlock = await lock();
    term.pause();
    // multiline should be split (useful when pasting)
    for (const c of command.split("\n")) {
      const escaped = c.replaceAll(/\u00a0/g, " ");
      let fut = pyconsole.push(escaped);
      term.set_prompt(fut.syntax_check === "incomplete" ? ps2 : ps1);
      switch (fut.syntax_check) {
        case "syntax-error":
          term.error(fut.formatted_error.trimEnd());
          continue;
        case "incomplete":
          continue;
        case "complete":
          break;
        default:
          throw new Error(`Unexpected type ${ty}`);
      }
      // In JavaScript, await automatically also awaits any results of
      // awaits, so if an async function returns a future, it will await
      // the inner future too. This is not what we want so we
      // temporarily put it into a list to protect it.
      let wrapped = await_fut(fut);
      // complete case, get result / error and print it.
      try {
        let [value] = await wrapped;
        if (value !== undefined) {
          echo(value);
        }
        if (value instanceof pyodide.ffi.PyProxy) {
          value.destroy();
        }
      } catch (e) {
        if (e.constructor.name === "PythonError") {
          const message = fut.formatted_error || e.message;
          term.error(message.trimEnd());
        } else {
          throw e;
        }
      } finally {
        fut.destroy();
        wrapped.destroy();
      }
    }
    term.resume();
    await sleep(10);
    unlock();
  }

  term = $("body").terminal(interpreter, {
    greetings: banner,
    prompt: ps1,
    completionEscape: false,
    completion: function (command, callback) {
      callback(pyconsole.complete(command).toJs()[0]);
    },
    keymap: {
      "CTRL+C": async function (event, original) {
        clear_console();
        term.enter();
        echo("KeyboardInterrupt");
        term.set_command("");
        term.set_prompt(ps1);
      },
      TAB: (event, original) => {
        const command = term.before_cursor();
        // Disable completion for whitespaces.
        if (command.trim() === "") {
          term.insert("\t");
          return false;
        }
        return original(event);
      },
    },
  });
  window.term = term;
  pyconsole.stdout_callback = (s) => echo(s, { newline: false });
  pyconsole.stderr_callback = (s) => {
    term.error(s.trimEnd());
  };
  term.ready = Promise.resolve();

  const searchParams = new URLSearchParams(window.location.search);
}
window.console_ready = main();