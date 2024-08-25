import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Stage, Layer, Rect, Text, Group, Line } from 'react-konva';
import randomColor from 'randomcolor';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExplanationModal from './ExplanationModal';
import FileContentModal from './FileContentModal';

function Visualizer() {
  const location = useLocation();
  const [fileColors, setFileColors] = useState({});
  const [connections, setConnections] = useState([]);
  const [hoveredConnection, setHoveredConnection] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);
  const [showConnections, setShowConnections] = useState({});
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [files, setFiles] = useState([]);

  const genAI = new GoogleGenerativeAI('AIzaSyAiWMMeVazS_T7wiDIN9FdGhJh3VprunAE'); 
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Extract repo from the query string
  const queryParams = new URLSearchParams(location.search);
  const repo = queryParams.get('repo');

  const fetchWithRetry = async (url, options = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error(`Attempt ${i + 1} failed: ${error.message}`);
        if (i < retries - 1) {
          console.log(`Retrying... (${i + 2}/${retries})`);
        } else {
          throw error;
        }
      }
    }
  };
  
  useEffect(() => {
    const fetchFilesFromRepoAndProcess = async () => {
      if (!repo) {
        console.error('Repo is undefined. Please provide a valid GitHub repository.');
        return;
      }
  
      let branches = ['main', 'master'];
      let fetchedFiles = [];
  
      for (let branch of branches) {
        const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
        console.log('Fetching from URL:', url);
  
        try {
          const data = await fetchWithRetry(url, {
            headers: {
              'Authorization': `token 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`,
            },
          });
  
          console.log('Fetched data:', data);
  
          if (data.tree) {
            fetchedFiles = await Promise.all(
              data.tree
                .filter(item => item.type === 'blob')
                .map(async (item) => {
                  const fileData = await fetchWithRetry(item.url, {
                    headers: {
                      'Authorization': `token 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`, // Replace with your valid GitHub PAT
                    },
                  });
                  return {
                    path: item.path,
                    type: 'file',
                    content: atob(fileData.content), // Decode base64 content
                  };
                })
            );
            break; // If successful, exit loop
          }
        } catch (error) {
          console.error(`Error fetching files from branch ${branch}:`, error);
          if (branch === branches[branches.length - 1]) {
            console.error('Failed to fetch files from all branches.');
          }
        }
      }
  
      if (fetchedFiles.length > 0) {
        const folderColors = {};
        const connections = [];
        const usedColors = new Set(); // Track used colors
  
        // Step 1: Group files by folder and assign colors to folders
        fetchedFiles.forEach((file) => {
          const folder = file.path.substring(0, file.path.lastIndexOf('/'));
          if (!folderColors[folder]) {
            let color;
            do {
              color = randomColor({
                luminosity: 'dark',
                hue: 'random',
              });
            } while (usedColors.has(color));
            usedColors.add(color);
            folderColors[folder] = color;
          }
        });
  
        // Step 2: Assign colors to files based on folder
        const fileColors = {};
        fetchedFiles.forEach((file) => {
          const folder = file.path.substring(0, file.path.lastIndexOf('/'));
          fileColors[file.path] = folderColors[folder];
        });
  
        // Step 3: Create connections based on imports
        fetchedFiles.forEach((file, index) => {
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
                const importedFile = fetchedFiles.find(f => f.path.replace(/\.[^/.]+$/, "").endsWith(normalizedImportedPath));
  
                if (importedFile) {
                  const toIndex = fetchedFiles.indexOf(importedFile);
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
  
        setFiles(fetchedFiles);
        setFileColors(fileColors);
        setConnections(connections);
      }
    };
  
    fetchFilesFromRepoAndProcess();
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
              stroke={fileColors[files[conn.from].path]} 
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
      parts.pop(); 

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
  
  // Group by folder for legend
  const folders = Object.entries(fileColors).reduce((acc, [filePath, color]) => {
    const folder = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!acc[folder]) {
      acc[folder] = color;
    }
    return acc;
  }, {});
  
  // Convert folders object to an array of entries for mapping
const folderEntries = Object.entries(folders);
  return (
    <div style={{ position: 'relative', height: '100vh', backgroundColor: '#282c34' }}>
      <h2 style={{ color: 'white', textAlign: 'center' }}>GitHub Repository Visualizer</h2>
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
              height={folders.length * 30 + 50} // Adjust height based on the number of folders
              opacity={0.8}
            >
              <Rect 
                width={240}
                height={folders.length * 30 + 50} // Adjust height based on the number of folders
                fill="black" 
                shadowBlur={10} 
                cornerRadius={10} 
              />
              <Text
                text="Legend"
                fontSize={24}
                fill="white"
                fontStyle="bold"
                x={10}
                y={10}	
              />
              {folderEntries.map(([folder, color], i) => (
              <Group key={i} y={40 + (i * 30)}>
                <Rect width={20} height={20} fill={color} />
                <Text text={folder} fontSize={16} fill="white" x={30} />
              </Group>
            ))
            }
            </Group>
          </Layer>
        </Stage>
      ) : (
        <p style={{ color: 'white', textAlign: 'center' }}>Loading files or no repository found...</p>
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
