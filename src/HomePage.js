import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const [repoUrl, setRepoUrl] = useState('');
  const navigate = useNavigate();

  const handleSubmit = () => {
    let formattedRepoUrl = repoUrl.trim();

    // If full URL, extract the relevant part
    if (formattedRepoUrl.startsWith('https://github.com/')) {
      formattedRepoUrl = formattedRepoUrl.replace('https://github.com/', '');
    }

    if (formattedRepoUrl) {
      navigate(`/visualize?repo=${encodeURIComponent(formattedRepoUrl)}`);
    } else {
      alert('Please enter a valid GitHub repository URL or path.');
    }
  };

  return (
    <div className="HomePage">
      <header className="App-header">
        <h1>GitHub Repository 2D Visualizer</h1>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="Enter GitHub repo (e.g., https://github.com/githubtraining/hellogitworld or githubtraining/hellogitworld)"
        />
        <button onClick={handleSubmit}>Continue</button>
      </header>
    </div>
  );
}

export default HomePage;
