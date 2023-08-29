import { loadPyodide, version as pyodide_version } from "pyodide";  
import { FitAddon } from "xterm-addon-fit";
import { Terminal as XTerm} from "xterm";
import { useRef, useEffect } from 'react';

export default function Terminal(){
  const termRef=useRef(null)
  let pyodide
  const { log, warn } = console;
  let ready = false;
  let typeListening = true
  const term = new XTerm({
    allowProposedApi: true
  });
  window.term = term;

  const termHistory = ['']
  let currentHistoryLine = 0
  let currentLine = ''

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  const onResize = () =>{
    fitAddon.fit();
  }
  useEffect(() => { 
    term.open(termRef.current)
    onResize();
    window.onresize = onResize
    function format(fmt) {
      var re = /(%?)(%([jds]))/g,
      args = Array.prototype.slice.call(arguments, 1),
      fmt = fmt?.toString()||"";
      if(args.length) {
        fmt = fmt.replace(re, function(match, escaped, ptn, flag) {
          var arg = args.shift();
          switch(flag) {
            case 's':
              arg = '' + arg;
              break;
            case 'd':
              arg = Number(arg);
              break;
            case 'j':
              arg = JSON.stringify(arg);
              break;
          }
          if(!escaped) {
            return arg; 
          }
          args.unshift(arg);
          return match;
        })
      }
      if(args.length) {
        fmt += ' ' + args.join(' ');
      }
      fmt = fmt.replace(/%{2,2}/g, '%');
      return '' + fmt;
    }
    const write = (...args) => term.write(format(...args).replace(/\n/g,'\r\n'))
    const writeln = (...args) => term.writeln(format(...args).replace(/\n/g,'\r\n'))

    const pressed = {}
    const isDown = key =>{
      if(pressed[key]) return true;
      return false;
    }
    //.replace(/\n/g,'\r\n')
    let bracketComplete = true;
    let multiLine = false;
    let curCode = '';
    const willBreakeLine = ()=>{
      const openP = []
      let done = true;
      let inString = false
      for(let i=0;i<curCode.length;i++){
        switch(curCode[i]){
          case '(':
            if(inString) break;
            openP.push(0)
            break;
          case '{':
            if(inString) break;
            openP.push(1)
            break;
          case '[':
            if(inString) break;
            openP.push(2)
            break;
          case ')':
            if(inString) break;
            if(openP[openP.length-1]===0) openP.pop()
            else return false
            break;
          case '}':
            if(inString) break;
            if(openP[openP.length-1]===1) openP.pop()
            else return false
            break;
          case ']':
            if(inString) break;
            if(openP[openP.length-1]===2) openP.pop()
            else return false
            break;
          case "'":
            if(inString && openP[openP.length-1]===3){
              inString = false
              openP.pop()
            }else{
              inString = true
              openP.push(3)
            }
            break;
          case '"':
            if(inString && openP[openP.length-1]===4){
              inString = false
              openP.pop()
            }else{
              inString = true
              openP.push(4)
            }
            break;
          default:
            break;
        }
      }
      if(openP.length===0){
        if(curCode[curCode.length-1]===':')return true;
        return false;
      }
      return true;
    }

    term.attachCustomKeyEventHandler(async e=>{
      if(!ready)return null;
      if(e.type==='keyup')pressed[e.key]=false
      else if(e.type==='keydown') pressed[e.key]=true
    })
    term.onKey(async e=>{
      if(!typeListening){
        if(e.domEvent.key==='Backspace') term.write('\x1b[D \x1b[D')
        else if(e.key==='\r') term.write('\r\n')
        else term.write(e.key);
        return 0;
      }
      if(e.key==='\r'){   //enter is pressed
        termHistory[0] = currentLine
        curCode += currentLine
        currentLine = ''
        currentHistoryLine = 0
        termHistory.unshift('')
        if(isDown('Shift') || willBreakeLine()){
          //multi-line script
          multiLine = true;
          curCode += '\n'
          term.write('\n\r... ')
        }else{
          if(multiLine===true){
            //when multi-line code is completed
            //this looks dirty tho
            if(curCode[curCode.length-1]==='\n')multiLine = false;
            else {
              curCode += '\n'
              term.write('\r\n... ')
              return 0;
            }
          }
          term.write('\r\n')
          if(curCode.length===0){
            term.write('>>> ')
            return 0;
          }
          
          //execute Python🐍🐍🐍🐍🐍🐍🐍🐍🐍🐍
          typeListening = false
          await pyodide.runPythonAsync(curCode).then(v=>{
            if(typeof v === 'string') write(`'${v.replace(/\n/g,'\\n')}'`)
            else write(v)
          }).catch(err=>{
            write(err)
          }).then(()=>{
            typeListening = true
            curCode = ''
            term.write('\r\n>>> ')
          })
          
        }
        return 0;
      }else if(e.domEvent.key==='Backspace'){
        if(term.buffer.active.cursorX>4){
          if(currentHistoryLine!==0){
            termHistory[0] = currentLine
          }
          currentLine = currentLine.substring(0,currentLine.length-1);
          termHistory[0] = currentLine
          term.write('\x1b[D \x1b[D')
        }
        return 0;
      }
      switch(e.domEvent.key){
        case 'ArrowRight':
          //right arrow
          //term.write('\x1b[C')
          break;
        case 'ArrowLeft':
          //term.write('\x1b[D')
          break;
        case 'ArrowUp':
          //term.write('\x1b[D')
          if(currentHistoryLine<termHistory.length){
            currentHistoryLine++;
            term.write('\x1b[5G\x1b[K')
            term.write(termHistory[currentHistoryLine])
            currentLine = termHistory[currentHistoryLine]
          }
          break;
        case 'ArrowDown':
          if(currentHistoryLine>0){
            currentHistoryLine--
            term.write('\x1b[5G\x1b[K')
            term.write(termHistory[currentHistoryLine])
            currentLine = termHistory[currentHistoryLine]
            
          }
          //term.write('\x1b[D')
          
          break;
        case 'Tab':
          term.write('    ');
          currentLine += '    '
          termHistory[0] = currentLine
          break;
        default:
          term.write(e.key);
          currentLine += e.key
          termHistory[0] = currentLine
          break;
      }
    })


    const main = async () => {
      writeln(`
    \x1b[96m          .?77777777777777$.            
    \x1b[96m          777..777777777777$+           
    \x1b[96m         .77    7777777777$$$           
    \x1b[96m         .777 .7777777777$$$$           
    \x1b[96m         .7777777777777$$$$$$           
    \x1b[96m         ..........:77$$$$$$$           
    \x1b[96m  .77777777777777777$$$$$$$$$.\x1b[93m=======.  
    \x1b[96m 777777777777777777$$$$$$$$$$.\x1b[93m========  
    \x1b[96m7777777777777777$$$$$$$$$$$$$.\x1b[93m========= 
    \x1b[96m77777777777777$$$$$$$$$$$$$$$.\x1b[93m========= 
    \x1b[96m777777777777$$$$$$$$$$$$$$$$ :\x1b[93m========+.
    \x1b[96m77777777777$$$$$$$$$$$$$$+.\x1b[93m.=========++~
    \x1b[96m777777777$$..\x1b[93m~=====================+++++
    \x1b[96m77777777$~.\x1b[93m~~~~=~=================+++++.
    \x1b[96m777777$$$.\x1b[93m~~~===================+++++++.
    \x1b[96m77777$$$$.\x1b[93m~~==================++++++++: 
    \x1b[96m 7$$$$$$$.\x1b[93m==================++++++++++. 
    \x1b[96m .,$$$$$$.\x1b[93m================++++++++++~.  
            .=========~.........           
            .=============++++++           
            .===========+++..+++           
            .==========+++.  .++           
              ,=======++++++,,++,           
              ..=====+++++++++=.            
                    ..~+=...                     
                    \x1b[0m
    Preparing python interpreter. Please wait...\n`)
      pyodide = await loadPyodide({
        indexURL : `https://cdn.jsdelivr.net/pyodide/v${pyodide_version}/full/`
      });
      pyodide.globals.set('so', {
        write: write,
        writeln: writeln
      })
      pyodide.globals.set('si', {
        write: write,
        readline: async (charNum) =>new Promise(r=>{
          charNum ?? (charNum = term.cols)
          writeln()
          const b = term.buffer.active
          setTimeout(()=>term.onLineFeed(()=>{
            r(b.getLine(b.viewportY+b.cursorY-1).translateToString(true,0,charNum))
            return term
          }),400)
        })
        
      })
      pyodide.globals.set('input', async (msg)=>new Promise(r=>{
          write(msg)
          const b = term.buffer.active
          setTimeout(()=>term.onLineFeed(()=>{
            r(b.getLine(b.viewportY+b.cursorY-1).translateToString(true,0))
            return term
          }),400)
        }))
      pyodide.globals.set('sleep',(t)=>new Promise(r=>setTimeout(r,t*1000)))

      pyodide.runPython(
    `
    import sys
    import time
    time.sleep = sleep
    sys.stdout = so
    sys.stdin = si
    print(sys.version)
    print('Type "help", "copyright", "credits" or "license" for more information.')
    `)
      write("\nPlease use 'await' before writing functions such as 'sleep' or 'input'.\n\n>>> ")
      ready=true;
    }
    main()
    //document.addEventListener('DOMContentLoaded',()=>main())
    //setTimeout(main, 2000)
  })
  return (
    <div id="terminal" ref={termRef}></div>
  )
}