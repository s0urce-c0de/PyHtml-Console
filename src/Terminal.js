import React, { useEffect, useRef } from 'react';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal as XTerm } from 'xterm';
import { version as pyodide_version, loadPyodide } from 'pyodide';
import 'xterm/css/xterm.css'
const Terminal = () => {
  const termRef = useRef(null);
  const fitAddon = useRef(new FitAddon());
  const termHistory = useRef(['']);
  const currentHistoryLine = useRef(0);
  const currentLine = useRef('');
  const curCode = useRef('');
  const multiLine = useRef(false);
  const ready = useRef(false);
  const typeListening = useRef(true);
  const pyodide = (async function(){await loadPyodide({indexURL : `https://cdn.jsdelivr.net/pyodide/v${pyodide_version}/full/`})})().then(function(python){window.pyodide=python;return window.pyodide})
  const pressed = {}
  // Event listener for keydown event
  document.addEventListener('keydown',e=>pressed[e.key]=true);

  // Event listener for keyup event
  document.addEventListener('keyup',e=>pressed[e.key]=false);

  useEffect(() => {
    const term = new XTerm({
      allowProposedApi: true
    });
    term.loadAddon(fitAddon.current);
    term.open(termRef.current);
    fitAddon.current.fit();
    window.onresize=()=>fitAddon.current.fit();
    term.onKey(async (event) => {
      if (!typeListening.current) return;
      console.log(event)
      if (event.key === '\x7f') {
        if (term.buffer.active.cursorX > 4) {
          if (currentHistoryLine.current !== 0) {
            termHistory.current[0] = currentLine.current;
          }
          currentLine.current = currentLine.current.slice(0, -1);
          termHistory.current[0] = currentLine.current;
          term.write('\b \b');
        }
        return 0;
      }
      if (event.key === '\r') {
        if (termHistory.current[0] !== currentLine.current) {
          termHistory.current[0] = currentLine.current;
        }
        curCode.current += currentLine.current;
        currentLine.current = '';
        currentHistoryLine.current = 0;
        termHistory.current.unshift('');
        if (!isDown('Shift') || willBreakLine()) {
          multiLine.current = true;
          curCode.current += '\n';
          term.write('\n\t... ');
        } else {
          if (multiLine.current) {
            if (curCode.current[curCode.current.length - 1] !== '\n') {
              return 0;
            }
            multiLine.current = false;
          }
          term.write('\n\r');
          if (curCode.current.length === 0) {
            term.write('>>> ');
            return 0;
          }
          typeListening.current = false;
          await pyodide.runPythonAsync(curCode.current)
            .then((result) => {
              if (typeof result === 'string') {
                write(`'${result.replace(/\n/g, '\\n')}'`);
              } else {
                write(result);
              }
            })
            .catch((error) => {
              write(error);
            })
            .then(() => {
              typeListening.current = true;
              curCode.current = '';
              term.write('\r\n>>> ');
            });
        }
        return 0;
      }
      if (event.key === '\x1b[A') {
        if (currentHistoryLine.current > 0) {
          currentHistoryLine.current--;
          term.write('\x1b[5G\x1b[K');
          term.write(termHistory.current[currentHistoryLine.current]);
          currentLine.current = termHistory.current[currentHistoryLine.current];
        }
        return 0;
      }
      if (event.key === '\t') {
        term.write('  ');
        currentLine.current += '  ';
        termHistory.current[0] = currentLine.current;
        return 0;
      }
      term.write(event.key);
      currentLine.current += event.key;
      termHistory.current[0] = currentLine.current;
    });

    const onResize = () => {
      fitAddon.current.fit();
    };

    term.onResize(onResize);

    return () => {
      term.dispose();
    };
  });

  const write = (...args) => {
    termRef.current.terminal.write(format(...args).replace(/\n/g, '\r\n'));
  };

  const writeln = (...args) => {
    termRef.current.terminal.writeln(format(...args).replace(/\n/g, '\r\n'));
  };

  const isDown = (key) => {
    return !!pressed[key];
  };

  const willBreakLine = () => {
    const lines = [];
    let inQuotes = false;
    let inComment = false;
    let inLineComment = false;
    for (let i = 0; i < curCode.current.length; i++) {
      const char = curCode.current[i];
      if (char === '"' && !inComment && !inLineComment) {
        inQuotes = !inQuotes;
      }
      if (char === '/' && i < curCode.current.length - 1) {
        if (curCode.current[i + 1] === '/') {
          if (!inQuotes && !inComment) {
            inLineComment = true;
          }
        } else if (curCode.current[i + 1] === '*') {
          if (!inQuotes && !inComment && !inLineComment) {
            inComment = true;
          }
        }
      }
      if (char === '\n' && !inQuotes && !inComment && !inLineComment) {
        lines.push(i);
      }
      if (char === '*' && i < curCode.current.length - 1) {
        if (curCode.current[i + 1] === '/') {
          if (!inQuotes && !inLineComment) {
            inComment = false;
            i++;
          }
        }
      }
      if (char === '\r' && i < curCode.current.length - 1 && curCode.current[i + 1] === '\n') {
        i++;
      }
    }
    return lines.length === 0 || lines[lines.length - 1] !== curCode.current.length - 1;
  };

  const format = (str, ...args) => {
    let formatted = str?.toString() || '';
    if (args.length) {
      formatted = formatted.replace(/(%?)(%([jds]))/g, (match, escaped, ptn, specifier) => {
        const arg = args.shift();
        switch (specifier) {
          case 's':
            return escaped ? match : `${arg}`;
          case 'd':
            return escaped ? match : Number(arg);
          case 'j':
            return escaped ? match : JSON.stringify(arg);
          default:
            return match;
        }
      });
    }
    if (args.length) {
      formatted += ` ${args.join(' ')}`;
    }
    formatted = formatted.replace(/%{2,2}/g, '%');
    return `${formatted}`;
  };

  const termStyle = {
    width: '100%',
    height: '100%',
  };
  return (
    <div ref={termRef} style={termStyle}></div>
  );
};

export default Terminal;