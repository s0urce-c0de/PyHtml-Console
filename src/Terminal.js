import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';
import './Terminal.css'
import { loadPyodide } from 'pyodide';

const term = new XTerm();
term.prompt = () => {
  term.write('\n\r>>> ')
}
const Terminal = () => {
  const termRef = useRef(null);
  var curr_line = '';
  useEffect(() => {

    // Attach the term to the DOM
    term.open(termRef.current);

    let pyodideReady = false;

    // Load Pyodide
    const pyodide = (async function() {
      const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' }).then(function(p){window.pyodide=p;return p});
      var pyodideReady = true;
      return pyodide
    })()

    // Send term input to Pyodide for execution
    term.onKey(function(ev) {
      if (ev.key === '\r') {
        execpy(curr_line)
        curr_line=''
        term.prompt()
      } else if (ev.key === '\x7f' || ev.key === '\x08') {
        term.write('\b \b')
        curr_line=curr_line.slice(0, -1)
      } else {
        curr_line += ev.key
        term.write((ev.key))
      }
      console.log(ev);
    })
    // Execute Python code using Pyodide
    const execpy = (code) => {
      console.log(window.pyodide === pyodide)
      window.pyodide.runPythonAsync(code).then((result) => {
        term.writeln(result);
      }).catch(error => {
        term.writeln(`Error: ${error}`);
      }).finally(() => {
        term.write(`\n${term.prompt}`);
      });
    };

    term.writeln('Python React Terminal');
    term.prompt();

    // Clean up resources on component unmount
    return () => {
      term.dispose();
    };
  }, []);

  return <div id="terminal" ref={termRef} />;
};

export default Terminal;