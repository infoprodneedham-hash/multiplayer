import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Crown, 
  RotateCcw, 
  Send, 
  Users, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  Play, 
  ArrowLeft,
  MessageSquare,
  Award
} from 'lucide-react';

// Demo Firebase configuration (Fallback / Shared Config)
const firebaseConfig = {
  apiKey: "AIzaSyDemoCheckersKeyForTestingOnly",
  authDomain: "checkers-multiplayer-demo.firebaseapp.com",
  projectId: "checkers-multiplayer-demo",
  storageBucket: "checkers-multiplayer-demo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Web Audio API Sound Synthesizer
const playAudioSound = (type: 'move' | 'capture' | 'king' | 'win', muted: boolean) => {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(360, now + 0.06);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'king') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      osc.frequency.setValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.15);
      osc.frequency.setValueAtTime(783.99, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (err) {
    console.error("Audio playback error:", err);
  }
};

type PieceColor = 'red' | 'black';

interface Piece {
  player: PieceColor;
  isKing: boolean;
}

type BoardState = (Piece | null)[][];

interface MoveOption {
  r: number;
  c: number;
  captured?: { r: number; c: number };
}

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

interface GameRoomData {
  board: BoardState;
  turn: PieceColor;
  status: 'waiting' | 'playing' | 'finished';
  winner: PieceColor | null;
  redPlayerJoined: boolean;
  blackPlayerJoined: boolean;
  messages: ChatMessage[];
  lastMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null;
  capturedRed: number;
  capturedBlack: number;
}

const INITIAL_BOARD = (): BoardState => {
  const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) {
          board[r][c] = { player: 'black', isKing: false };
        } else if (r > 4) {
          board[r][c] = { player: 'red', isKing: false };
        }
      }
    }
  }
  return board;
};

export default function App() {
  const [gameMode, setGameMode] = useState<'menu' | 'local' | 'online'>('menu');
  const [roomId, setRoomId] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<PieceColor>('red');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD());
  const [turn, setTurn] = useState<PieceColor>('red');
  const [selectedPiece, setSelectedPiece] = useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = useState<MoveOption[]>([]);
  const [winner, setWinner] = useState<PieceColor | null>(null);
  
  const [capturedRed, setCapturedRed] = useState<number>(0);
  const [capturedBlack, setCapturedBlack] = useState<number>(0);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [roomStatus, setRoomStatus] = useState<'waiting' | 'playing' | 'finished'>('waiting');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (gameMode !== 'online' || !roomId) return;

    const roomRef = doc(db, 'checkers_rooms', roomId.toUpperCase());
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as GameRoomData;
        setBoard(data.board);
        setTurn(data.turn);
        setWinner(data.winner);
        setRoomStatus(data.status);
        setChatMessages(data.messages || []);
        setCapturedRed(data.capturedRed || 0);
        setCapturedBlack(data.capturedBlack || 0);

        if (data.winner) {
          playAudioSound('win', isMuted);
        }
      }
    });

    return () => unsubscribe();
  }, [gameMode, roomId, isMuted]);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createOnlineRoom = async () => {
    const newRoomCode = generateRoomCode();
    setRoomId(newRoomCode);
    setPlayerColor('red');
    setGameMode('online');

    const initialData: GameRoomData = {
      board: INITIAL_BOARD(),
      turn: 'red',
      status: 'waiting',
      winner: null,
      redPlayerJoined: true,
      blackPlayerJoined: false,
      messages: [{ sender: 'System', text: 'Room created. Share the room code to invite Player 2.', timestamp: Date.now() }],
      lastMove: null,
      capturedRed: 0,
      capturedBlack: 0,
    };

    await setDoc(doc(db, 'checkers_rooms', newRoomCode), initialData);
  };

  const joinOnlineRoom = async () => {
    const code = inputRoomId.trim().toUpperCase();
    if (!code) return;

    setRoomId(code);
    setPlayerColor('black');
    setGameMode('online');

    const roomRef = doc(db, 'checkers_rooms', code);
    await updateDoc(roomRef, {
      blackPlayerJoined: true,
      status: 'playing',
      messages: arrayUnion({
        sender: 'System',
        text: 'Black player joined. Game started!',
        timestamp: Date.now()
      })
    });
  };

  const getPossibleMoves = (r: number, c: number, currentBoard: BoardState) => {
    const piece = currentBoard[r][c];
    if (!piece) return [];

    const moves: MoveOption[] = [];
    const directions: number[][] = [];

    if (piece.player === 'red' || piece.isKing) {
      directions.push([-1, -1], [-1, 1]);
    }
    if (piece.player === 'black' || piece.isKing) {
      directions.push([1, -1], [1, 1]);
    }

    directions.forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;

      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        if (!currentBoard[nr][nc]) {
          moves.push({ r: nr, c: nc });
        } else if (currentBoard[nr][nc]?.player !== piece.player) {
          const jumpR = nr + dr;
          const jumpC = nc + dc;
          if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && !currentBoard[jumpR][jumpC]) {
            moves.push({ r: jumpR, c: jumpC, captured: { r: nr, c: nc } });
          }
        }
      }
    });

    return moves;
  };

  const handleSquareClick = (r: number, c: number) => {
    if (winner) return;
    if (gameMode === 'online') {
      if (roomStatus === 'waiting') return;
      if (turn !== playerColor) return;
    }

    const clickedPiece = board[r][c];

    if (clickedPiece && clickedPiece.player === turn) {
      setSelectedPiece({ r, c });
      setValidMoves(getPossibleMoves(r, c, board));
      return;
    }

    if (selectedPiece) {
      const targetMove = validMoves.find(m => m.r === r && m.c === c);
      if (targetMove) {
        executeMove(selectedPiece.r, selectedPiece.c, targetMove);
      } else {
        setSelectedPiece(null);
        setValidMoves([]);
      }
    }
  };

  const executeMove = async (fromR: number, fromC: number, move: MoveOption) => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[fromR][fromC]!;
    
    newBoard[fromR][fromC] = null;

    let isKinged = piece.isKing;
    if (!isKinged) {
      if ((piece.player === 'red' && move.r === 0) || (piece.player === 'black' && move.r === 7)) {
        isKinged = true;
        playAudioSound('king', isMuted);
      }
    }

    newBoard[move.r][move.c] = { player: piece.player, isKing: isKinged };

    let newCapRed = capturedRed;
    let newCapBlack = capturedBlack;

    if (move.captured) {
      newBoard[move.captured.r][move.captured.c] = null;
      if (piece.player === 'red') newCapBlack += 1;
      else newCapRed += 1;
      playAudioSound('capture', isMuted);
    } else {
      playAudioSound('move', isMuted);
    }

    const nextTurn = turn === 'red' ? 'black' : 'red';
    let gameWinner: PieceColor | null = null;

    if (newCapBlack === 12) gameWinner = 'red';
    if (newCapRed === 12) gameWinner = 'black';

    setBoard(newBoard);
    setTurn(nextTurn);
    setSelectedPiece(null);
    setValidMoves([]);
    setCapturedRed(newCapRed);
    setCapturedBlack(newCapBlack);
    if (gameWinner) setWinner(gameWinner);

    if (gameMode === 'online' && roomId) {
      const roomRef = doc(db, 'checkers_rooms', roomId);
      await updateDoc(roomRef, {
        board: newBoard,
        turn: nextTurn,
        winner: gameWinner,
        capturedRed: newCapRed,
        capturedBlack: newCapBlack,
        status: gameWinner ? 'finished' : 'playing',
        lastMove: { from: { r: fromR, c: fromC }, to: { r: move.r, c: move.c } }
      });
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !roomId) return;
    const msgText = chatInput.trim();
    setChatInput('');

    const roomRef = doc(db, 'checkers_rooms', roomId);
    await updateDoc(roomRef, {
      messages: arrayUnion({
        sender: playerColor === 'red' ? 'Red' : 'Black',
        text: msgText,
        timestamp: Date.now()
      })
    });
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const resetGame = () => {
    setBoard(INITIAL_BOARD());
    setTurn('red');
    setWinner(null);
    setSelectedPiece(null);
    setValidMoves([]);
    setCapturedRed(0);
    setCapturedBlack(0);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
      {/* MENU STATE */}
      {gameMode === 'menu' && (
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-xl mt-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Checkers Arena</h1>
            <p className="text-sm text-slate-400">Play real-time multiplayer across any device or practice locally.</p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={createOnlineRoom}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 font-bold text-white shadow-lg shadow-rose-950/40 transition-all flex items-center justify-center space-x-3 active:scale-95"
            >
              <Users className="w-5 h-5" />
              <span>Create Online Room</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold text-slate-500 uppercase">Or Join Room</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="6-Letter Code"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                maxLength={6}
                className="flex-grow bg-slate-950 border border-slate-800 rounded-xl px-4 text-center font-mono tracking-widest text-lg font-bold text-white uppercase focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={joinOnlineRoom}
                className="py-3 px-6 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-200 transition-colors"
              >
                Join
              </button>
            </div>

            <button
              onClick={() => { setGameMode('local'); resetGame(); }}
              className="w-full py-3.5 px-6 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-semibold transition-all border border-slate-700/50 flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>Pass & Play (Same Device)</span>
            </button>
          </div>
        </div>
      )}

      {/* GAMEPLAY STATE */}
      {gameMode !== 'menu' && (
        <div className="w-full flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT/TOP GAME BOARD SECTION */}
          <div className="flex-grow w-full flex flex-col items-center space-y-4">
            {/* Top Toolbar */}
            <div className="w-full max-w-lg bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between backdrop-blur-md">
              <button
                onClick={() => setGameMode('menu')}
                className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Menu</span>
              </button>

              {gameMode === 'online' && (
                <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Code:</span>
                  <span className="font-mono font-bold text-rose-400 tracking-wider text-sm">{roomId}</span>
                  <button onClick={copyRoomCode} className="text-slate-400 hover:text-white transition-colors ml-1">
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Scoreboard / Turn Indicator */}
            <div className="w-full max-w-lg grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${turn === 'red' ? 'bg-rose-950/40 border-rose-500/50 ring-1 ring-rose-500/50' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="flex items-center space-x-2.5">
                  <div className="w-5 h-5 rounded-full bg-rose-600 border border-rose-300 shadow-sm" />
                  <span className="font-bold text-sm text-slate-200">Red Player</span>
                </div>
                <span className="text-xs font-bold bg-slate-950 px-2 py-1 rounded-md text-slate-400">
                  Caps: {capturedBlack}
                </span>
              </div>

              <div className={`p-3 rounded-2xl border flex items-center justify-between ${turn === 'black' ? 'bg-slate-800/80 border-slate-600 ring-1 ring-slate-500' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="flex items-center space-x-2.5">
                  <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-600 shadow-sm" />
                  <span className="font-bold text-sm text-slate-200">Black Player</span>
                </div>
                <span className="text-xs font-bold bg-slate-950 px-2 py-1 rounded-md text-slate-400">
                  Caps: {capturedRed}
                </span>
              </div>
            </div>

            {/* Checkers Board */}
            <div className="relative p-3 bg-slate-900 border-2 border-slate-800 rounded-3xl shadow-2xl">
              <div className="grid grid-cols-8 gap-0 rounded-2xl overflow-hidden w-[340px] h-[340px] sm:w-[440px] sm:h-[440px]">
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const isDarkSquare = (r + c) % 2 === 1;
                    const isSelected = selectedPiece?.r === r && selectedPiece?.c === c;
                    const isValidTarget = validMoves.some(m => m.r === r && m.c === c);

                    return (
                      <div
                        key={`${r}-${c}`}
                        onClick={() => handleSquareClick(r, c)}
                        className={`relative flex items-center justify-center select-none transition-colors duration-150 ${
                          isDarkSquare ? 'bg-slate-800' : 'bg-slate-200'
                        } ${isSelected ? 'ring-4 ring-amber-400 z-10' : ''}`}
                      >
                        {/* Piece rendering */}
                        {cell && (
                          <div
                            className={`w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-lg transition-transform transform ${
                              cell.player === 'red'
                                ? 'bg-gradient-to-tr from-rose-700 to-rose-500 border-2 border-rose-300'
                                : 'bg-gradient-to-tr from-slate-950 to-slate-800 border-2 border-slate-600'
                            }`}
                          >
                            {cell.isKing && (
                              <Crown className={`w-1/2 h-1/2 ${cell.player === 'red' ? 'text-amber-300' : 'text-amber-400'}`} />
                            )}
                          </div>
                        )}

                        {/* Move Indicator */}
                        {isValidTarget && (
                          <div className="w-4 h-4 rounded-full bg-emerald-400/80 animate-ping" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Winner Overlay */}
              {winner && (
                <div className="absolute inset-0 bg-slate-950/90 rounded-3xl flex flex-col items-center justify-center space-y-4 p-6 text-center backdrop-blur-md">
                  <Award className="w-16 h-16 text-amber-400 animate-bounce" />
                  <h2 className="text-3xl font-black text-white capitalize">{winner} Wins!</h2>
                  <p className="text-sm text-slate-400">All opponent pieces were captured.</p>
                  <button
                    onClick={resetGame}
                    className="py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center space-x-2 shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Play Again</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT / CHAT PANEL (ONLINE MODE ONLY) */}
          {gameMode === 'online' && (
            <div className="w-full lg:w-80 bg-slate-900/80 border border-slate-800 rounded-3xl p-4 flex flex-col h-[480px] backdrop-blur-md">
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                <MessageSquare className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-sm text-slate-200">Room Live Chat</h3>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 py-3 text-xs">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl max-w-[85%] ${
                      msg.sender === 'System'
                        ? 'bg-slate-800/50 text-slate-400 mx-auto text-center w-full italic'
                        : msg.sender === (playerColor === 'red' ? 'Red' : 'Black')
                        ? 'bg-rose-600/20 border border-rose-500/30 text-rose-200 ml-auto'
                        : 'bg-slate-800 text-slate-300 mr-auto'
                    }`}
                  >
                    {msg.sender !== 'System' && (
                      <span className="font-bold block text-[10px] opacity-75 mb-0.5">{msg.sender}</span>
                    )}
                    <span>{msg.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="flex space-x-2 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="flex-grow bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={sendChatMessage}
                  className="p-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-white transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
