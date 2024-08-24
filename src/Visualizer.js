import React, { useState, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Label, Tag } from 'react-konva';
import randomColor from 'randomcolor';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExplanationModal from './ExplanationModal'; // Assume this is your modal component
import FileContentModal from './FileContentModal';

function Visualizer() {
  const [fileColors, setFileColors] = useState({});
  const [connections, setConnections] = useState([]);
  const [hoveredConnection, setHoveredConnection] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false); // Modal state
  const [showConnections, setShowConnections] = useState({}); // Toggle connections per file
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

  const genAI = new GoogleGenerativeAI('AIzaSyAiWMMeVazS_T7wiDIN9FdGhJh3VprunAE');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const files = [
    {
      path: 'src/index.js',
      type: 'file',
      content: `
        import App from "./App";
        import Visualizer from "./components/Visualizer";
        console.log("Hello World from index.js");
      `,
    },
    {
      path: 'src/App.js',
      type: 'file',
      content: `
        import React from "react";
        import './App.css';
        export default function App() { 
          return <div>Hello World</div>; 
        }
      `,
    },
    {
      path: 'src/components/Visualizer.js',
      type: 'file',
      content: `
        import React from "react";
        import './Visualizer.css';
        // Visualizer component code...
      `,
    },
    {
      path: 'src/App.css',
      type: 'file',
      content: `
        /* CSS for App component */
        body {
          background-color: #f0f0f0;
        }
      `,
    },
    {
      path: 'src/components/Visualizer.css',
      type: 'file',
      content: `
        /* CSS for Visualizer component */
        .visualizer {
          border: 1px solid #ccc;
        }
      `,
    },
    {
      path: 'public/index.html',
      type: 'file',
      content: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>App</title>
        </head>
        <body>
          <div id="root"></div>
        </body>
        </html>
      `,
    },
    {
      path: 'public/favicon.ico',
      type: 'file',
      content: 'Binary data for favicon.ico',
    },
  ];

  useEffect(() => {
    const colors = {};
    const connections = [];
    const usedColors = new Set(); // Track used colors

    files.forEach((file, index) => {
        let color;
        // Keep generating a new color until it's unique
        do {
          color = randomColor({
            luminosity: 'dark',
            hue: 'random',
          });
        } while (usedColors.has(color));
        usedColors.add(color); // Add the color to the set
  
        colors[file.path] = color;

      const lines = file.content.split('\n');
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('import ')) {
          const match = trimmedLine.match(/from ['"](.*)['"]/);
          if (match) {
            let importedPath = match[1];
            if (importedPath.startsWith('./')) {
              importedPath = importedPath.slice(2);
            }
            const normalizedImportedPath = importedPath.replace(/\.[^/.]+$/, "");
            const importedFile = files.find(f => f.path.replace(/\.[^/.]+$/, "").endsWith(normalizedImportedPath));

            if (importedFile) {
              const toIndex = files.indexOf(importedFile);
              connections.push({
                from: index,
                to: toIndex,
                line: trimmedLine,
                importFile: importedFile,
              });
            }
          }
        }
      });
    });

    setFileColors(colors);
    setConnections(connections);
  }, []);

  const handleViewConnectionsClick = (fileIndex) => {
    setShowConnections(prevState => ({
      ...prevState,
      [fileIndex]: !prevState[fileIndex], // Toggle connection view
    }));
  };

  const handleHover = async (connection) => {
    setHoveredConnection(connection);
    const importingFileContent = files[connection.from].content;
    const importedFileContent = connection.importFile.content;
    const prompt = `
      The following is the content of the importing file:
      ${importingFileContent}

      The following is the content of the imported file:
      ${importedFileContent}

      Explain the purpose of the import statement:
      ${connection.line}
    `;

    try {
      const result = await model.generateContent([prompt]);
      setExplanation(result.response.text());
    } catch (error) {
      console.error('Error generating explanation:', error);
      setExplanation('Failed to load explanation.');
    }

    setIsExplanationModalOpen(true);
  };

  const renderConnections = (fileIndex) => {
    return connections
      .filter(conn => conn.from === fileIndex && showConnections[fileIndex])
      .map((conn, index) => {
        const fromNode = nodes[conn.from];
        const toNode = nodes[conn.to];

        if (!fromNode || !toNode) return null;

        const fromX = fromNode.x + 120; // Adjusted to reach the edge of the box
        const fromY = fromNode.y + 60;  // Adjusted to center vertically
        const toX = toNode.x;           // Adjusted to reach the edge of the box
        const toY = toNode.y + 60;      // Adjusted to center vertically

        return (
          <Group key={index}>
            <Line
              points={[fromX, fromY, toX, toY]}
              stroke={fileColors[files[conn.from].path]} // Use the file's color for the line
              strokeWidth={4} // Thicker line
              pointerLength={10}
              pointerWidth={10}
              lineCap="round"
              lineJoin="round"
              onMouseEnter={() => handleHover(conn)}
              onMouseLeave={() => setHoveredConnection(null)}
            />
          </Group>
        );
      });
  };

  const handleFileClick = (file) => {
    setSelectedFileContent(file.content);
    setIsModalOpen(true);
  };

  const handleUnderstandCodeClick = async (file) => {
    const prompt = `Explain the following code:\n${file.content}`;

    try {
      const result = await model.generateContent([prompt]);
      setExplanation(result.response.text());
      setIsExplanationModalOpen(true);
    } catch (error) {
      console.error('Error generating explanation:', error);
      setExplanation('Failed to load explanation.');
      setIsExplanationModalOpen(true);
    }
  };

  const handleUnderstandStructureClick = async () => {
    const directoryStructure = files.reduce((acc, file) => {
      const parts = file.path.split('/');
      parts.pop(); // Remove the filename to focus on the directory

      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath = index === 0 ? part : `${currentPath}/${part}`;
        if (!acc.includes(currentPath)) {
          acc.push(currentPath);
        }
      });

      return acc;
    }, []);

    const directoryList = directoryStructure.map(dir => `Directory: ${dir}`).join('\n');
    const fileContents = files.map(f => `// File: ${f.path}\n${f.content}`).join('\n\n');

    const prompt = `
      Explain the structure of the following codebase, including directories and files:

      ${directoryList}

      ${fileContents}
    `;

    try {
      const result = await model.generateContent([prompt]);
      setExplanation(result.response.text());
      setIsExplanationModalOpen(true);
    } catch (error) {
      console.error('Error generating explanation:', error);
      setExplanation('Failed to load explanation.');
      setIsExplanationModalOpen(true);
    }
  };

  const handleMouseEnter = (button) => {
    setHoveredButton(button);
  };

  const handleMouseLeave = () => {
    setHoveredButton(null);
  };

  const nodes = files.map((file, index) => {
    const x = (index % 10) * 200;
    const y = Math.floor(index / 10) * 200;

    return { x, y, file, color: fileColors[file.path] };
  });

  return (
    <div style={{ position: 'relative', height: '100vh', backgroundColor: '#282c34' }}>
      <h2 style={{ color: 'white', textAlign: 'center' }}>Local Folder Visualizer</h2>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          style={{
            padding: '10px 20px',
            fontSize: '18px',
            backgroundColor: hoveredButton === 'understand-structure' ? '#1a5bb8' : '#1a73e8',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={handleUnderstandStructureClick}
          onMouseEnter={() => handleMouseEnter('understand-structure')}
          onMouseLeave={handleMouseLeave}
        >
          Understand the Structure
        </button>
      </div>

      {files.length > 0 ? (
        <Stage width={window.innerWidth} height={window.innerHeight}>
          <Layer>
            {nodes.map((node, i) => (
              <Group key={i} x={node.x} y={node.y}>
                <Rect
                  width={120}
                  height={150}
                  fill={node.color}
                  shadowBlur={5}
                  cornerRadius={10}
                />
                <Text
                  text={node.file.path.split('/').pop()}
                  fontSize={14}
                  fill="white"
                  align="center"
                  verticalAlign="middle"
                  width={120}
                  height={40}
                  y={10}
                />
                <Text
                  text="View Code"
                  fontSize={14}
                  fill={hoveredButton === `view-${i}` ? 'yellow' : 'white'}
                  align="center"
                  verticalAlign="middle"
                  width={120}
                  height={30}
                  y={50} // Positioned below the filename
                  onClick={() => handleFileClick(node.file)}
                  onMouseEnter={() => handleMouseEnter(`view-${i}`)}
                  onMouseLeave={handleMouseLeave}
                />
                <Text
                  text="Understand Code"
                  fontSize={14}
                  fill={hoveredButton === `understand-${i}` ? 'yellow' : 'white'}
                  align="center"
                  verticalAlign="middle"
                  width={120}
                  height={30}
                  y={80} // Positioned below "View Code"
                  onClick={() => handleUnderstandCodeClick(node.file)}
                  onMouseEnter={() => handleMouseEnter(`understand-${i}`)}
                  onMouseLeave={handleMouseLeave}
                />
                   <Text
                  text="View Connections"
                  fontSize={14}
                  fill={hoveredButton === `connections-${i}` ? 'yellow' : 'white'}
                  align="center"
                  verticalAlign="middle"
                  width={120}
                  height={30}
                  y={110} // Positioned below "Understand Code"
                  onClick={() => handleViewConnectionsClick(i)}
                  onMouseEnter={() => handleMouseEnter(`connections-${i}`)}
                  onMouseLeave={handleMouseLeave}
                />
                {renderConnections(i)}
              </Group>
            ))}
          </Layer>
          <Layer>
            <Group
              x={window.innerWidth - 250}
              y={0}
              width={240}
              height={window.innerHeight - 10}
              opacity={0.8}
            >
              <Rect width={240} height={300} fill="black" shadowBlur={10} cornerRadius={10} />
              <Text
                text="Legend"
                fontSize={24}
                fill="white"
                fontStyle="bold"
                x={10}
                y={10}	
              />
              {files.map((file, i) => (
                <Group key={i} y={40 + (i * 30)}>
                  <Rect width={20} height={20} fill={fileColors[file.path]} />
                  <Text text={file.path} fontSize={16} fill="white" x={30} />
                </Group>
              ))}
            </Group>
          </Layer>

        </Stage>
      ) : (
        <p style={{ color: 'white', textAlign: 'center' }}>Loading files or no folder found...</p>
      )}

      {isModalOpen && (
        <FileContentModal
          isOpen={isModalOpen}
          content={selectedFileContent}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {isExplanationModalOpen && (
        <ExplanationModal
          isOpen={isExplanationModalOpen}
          explanation={explanation}
          onClose={() => setIsExplanationModalOpen(false)}
        />
      )}
    </div>
  );
}

export default Visualizer;
