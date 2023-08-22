import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css';
import './Terminal.css'
import { loadPyodide } from 'pyodide';


const term = new XTerm();
term.fitAddon = new FitAddon()
term.loadAddon(term.fitAddon)

term.prompt = () => {
  term.write('\n\r>>> ')
}
export default function Terminal(){
  const termRef = useRef(null);
  useEffect(() => {

    // Attach the term to the DOM
    term.open(termRef.current);

    let pyodideReady = false;

    // Load Pyodide
    const pyodide = (async function() {
      const pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
        stdout: (msg) => {
          term.write(msg)
          term.prompt()
        }
      }).then(function(p){window.pyodide=p;return p});
      var pyodideReady = true;
      return pyodide
    })()
    term.curr_line='';
    // Send term input to Pyodide for execution
    term.onKey(function(ev) {
      if (ev.key === '\r' || ev.key === '\n') {
        execpy(term.curr_line)
        term.curr_line=''
        term.prompt()
      } else if (ev.key === '\x7f') {
        if (term.curr_line !== '') {term.write('\b \b')}
        term.curr_line=term.curr_line.slice(0,-1)
      } else {
        term.curr_line += ev.key
        term.write(ev.key)
      }
    })
    // Execute Python code using Pyodide
    const execpy = (code) => {
      window.pyodide.runPythonAsync(code).then((result) => {
        console.log(result)
        term.write(result);
      }).catch(error => {
        console.log(error)
        term.write(`\n${error.message}`);
      })
    };

    term.fitAddon.fit()
    term.writeln('Python React Terminal');
    term.prompt();

    // Clean up resources on component unmount
    return () => {
      term.dispose();
    };
  }, []);

  return <div id="terminal" ref={termRef} />;
};
