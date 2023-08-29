import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css';
import './Terminal.css'
import { loadPyodide } from 'pyodide';


const term = new XTerm();
term.fitAddon = new FitAddon()
term.loadAddon(term.fitAddon)

term.prompt=()=>{term.write('\n\r>>> ')}
term.error=(msg)=>{term.write(`\r\n\x1b[31m${msg.slice(301,-1)}\x1b[m`);term.prompt()}
const echo=(msg,prompt=true)=>{term.write(msg);if(prompt){term.prompt()}}
function sleep(n){return new Promise(e=>setTimeout(e,n))}
export default function Terminal(){
  const termRef = useRef(null);
  useEffect(() => {
    // Attach the term to the DOM
    term.open(termRef.current);
    // eslint-disable-next-line
    let pyodideReady = false;
    // Load Pyodide
    // eslint-disable-next-line
    !async function(){return await loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.23.4/full/",stdout:echo,stderr:term.error})
    .then(function(d){return window.pyodide=d})}();const pyodide=window.pyodide;
    term.curr_line='';
    // Send term input to Pyodide for execution
    term.onKey(function(ev) {
      if (ev.key === '\r' || ev.key === '\n') {
        interpreter(term.curr_line)
      } else if (ev.key === '\x7f') {
        if (term.curr_line !== '') {term.write('\b \b')}
        term.curr_line=term.curr_line.slice(0,-1)
      } else {
        term.curr_line += ev.key
        term.write(ev.key)
      }
    })

    let namespace = window.pyodide.globals.get("dict")();
    //let locals=new Map()
    pyodide.runPython(
      `
        import sys
        from pyodide.ffi import to_js
        from pyodide.console import PyodideConsole, repr_shorten, BANNER
        import __main__
        BANNER = "Welcome to the Pyodide terminal emulator 🐍\\n" + BANNER
        pyconsole = PyodideConsole(__main__.__dict__)
        import builtins
        sys.ps1 = ">>> "
        sys.ps2 = "... "
        async def await_fut(fut):
          res = await fut
          if res is not None:
            builtins._ = res
          return to_js([res], depth=1)
        def clear_console():
          pyconsole.buffer = []
    `,
      { globals: namespace, /*locals: locals*/},
    );
    let repr_shorten = namespace.get("repr_shorten");
    let banner = namespace.get("BANNER");
    let await_fut = namespace.get("await_fut");
    let pyconsole = namespace.get("pyconsole");
    let clear_console = namespace.get("clear_console");
    let ps1 = namespace.get('sys.ps1'),ps2 = namespace.get('sys.ps2');
    namespace.destroy();

    async function interpreter(command) {
      // multiline should be split (useful when pasting)
      for (const c of command.split("\n")) {
        const escaped = c.replaceAll(/\u00a0/g, " ");
        let fut = pyconsole.push(escaped);
        switch (fut.syntax_check) {
          case "syntax-error":
            term.error(fut.formatted_error.trimEnd());
            continue;
          case "incomplete":
            term.prompt = ()=>{term.write("\n\r... ")};
          case "complete":
            term.prompt = ()=>{term.write("\n\r>>> ")};
            break;
          default:
            throw new Error(`Unexpected type ${fut.syntax_check}`);
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
            echo(
              repr_shorten.callKwargs(value, {
                separator: "\n<long output truncated>\n",
              }),
            );
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
      await sleep(10);
    }

    term.fitAddon.fit()
    term.writeln('Python React Terminal');
    term.prompt();

    // Clean up resources on component unmount
    return () => {
      term.dispose();
    };
  })

  return <div id="terminal" ref={termRef} />;
};
