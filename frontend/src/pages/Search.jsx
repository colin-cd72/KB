import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { searchApi } from '../services/api';
import {
  Search as SearchIcon,
  Sparkles,
  AlertCircle,
  FileText,
  Monitor,
  Loader2,
  Send,
  BookOpen
} from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';

function Search() {
  const [query, setQuery] = useState('');
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiIncludeManuals, setAiIncludeManuals] = useState(true);
  const [aiIncludeWeb, setAiIncludeWeb] = useState(false);

  // Regular search
  const { data: searchResults, isLoading: searchLoading, refetch: executeSearch } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const response = await searchApi.global({ q: query, limit: 10 });
      return response.data.results;
    },
    enabled: false,
  });

  // AI search
  const aiSearch = useMutation({
    mutationFn: async () => {
      const response = await searchApi.ai({
        query: aiQuery,
        include_manuals: aiIncludeManuals,
        include_web: aiIncludeWeb,
      });
      return response.data;
    },
  });

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setSearchExecuted(true);
      executeSearch();
    }
  };

  const handleAiSearch = (e) => {
    e.preventDefault();
    if (aiQuery.trim().length >= 5) {
      aiSearch.mutate();
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        <p className="mt-1 text-gray-500">Search through issues, manuals, articles, and equipment</p>
      </div>

      {/* Regular Search */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Search</h2>
        <form onSubmit={handleSearch}>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search issues, manuals, equipment..."
              className="input pl-10"
            />
          </div>
        </form>

        {/* Search Results */}
        {searchLoading && (
          <div className="mt-4 flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        )}

        {searchExecuted && !searchLoading && (
          <div className="mt-6 space-y-6">
            {/* Issues */}
            {searchResults?.issues?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <AlertCircle className="w-4 h-4" />
                  Issues ({searchResults.issues.length})
                </h3>
                <div className="space-y-2">
                  {searchResults.issues.map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.id}`}
                      className="block p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>
                        <span className={`badge status-${issue.status}`}>{issue.status}</span>
                        <span className="font-medium text-gray-900">{issue.title}</span>
                      </div>
                      {issue.snippet && (
                        <p
                          className="mt-1 text-sm text-gray-500 line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: issue.snippet }}
                        />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Manuals */}
            {searchResults?.manuals?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <BookOpen className="w-4 h-4" />
                  Manuals ({searchResults.manuals.length})
                </h3>
                <div className="space-y-2">
                  {searchResults.manuals.map((manual) => (
                    <a
                      key={manual.id}
                      href={manual.file_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50"
                    >
                      <span className="font-medium text-gray-900">{manual.title}</span>
                      {manual.category_name && (
                        <span className="ml-2 text-sm text-gray-500">({manual.category_name})</span>
                      )}
                      {manual.description && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-1">{manual.description}</p>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Articles */}
            {searchResults?.articles?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <FileText className="w-4 h-4" />
                  Articles ({searchResults.articles.length})
                </h3>
                <div className="space-y-2">
                  {searchResults.articles.map((article) => (
                    <Link
                      key={article.id}
                      to={`/articles/${article.slug}`}
                      className="block p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50"
                    >
                      <span className="font-medium text-gray-900">{article.title}</span>
                      {article.category_name && (
                        <span className="ml-2 text-sm text-gray-500">({article.category_name})</span>
                      )}
                      {article.summary && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{article.summary}</p>
                      )}
                      {article.snippet && !article.summary && (
                        <p
                          className="mt-1 text-sm text-gray-500 line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: article.snippet }}
                        />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Equipment */}
            {searchResults?.equipment?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <Monitor className="w-4 h-4" />
                  Equipment ({searchResults.equipment.length})
                </h3>
                <div className="space-y-2">
                  {searchResults.equipment.map((eq) => (
                    <Link
                      key={eq.id}
                      to={`/issues?equipment=${eq.id}`}
                      className="block p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50"
                    >
                      <span className="font-medium text-gray-900">{eq.name}</span>
                      {eq.model && <span className="ml-2 text-gray-500">{eq.model}</span>}
                      {eq.location && (
                        <span className="ml-2 text-sm text-gray-400">({eq.location})</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {searchResults?.issues?.length === 0 &&
              searchResults?.manuals?.length === 0 &&
              searchResults?.articles?.length === 0 &&
              searchResults?.equipment?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <SearchIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No results found for "{query}"</p>
                </div>
              )}
          </div>
        )}
      </div>

      {/* AI-Powered Search */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI-Powered Search</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Ask questions in natural language and get intelligent answers based on your knowledge base
        </p>

        <form onSubmit={handleAiSearch} className="space-y-4">
          <div>
            <textarea
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="E.g., How do I fix a printer showing error E-05? What's the process for resetting network equipment?"
              rows={3}
              className="input"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={aiIncludeManuals}
                onChange={(e) => setAiIncludeManuals(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <BookOpen className="w-4 h-4 text-gray-400" />
              Search manuals
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={aiIncludeWeb}
                onChange={(e) => setAiIncludeWeb(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <SearchIcon className="w-4 h-4 text-gray-400" />
              Include general knowledge
            </label>
          </div>

          <button
            type="submit"
            disabled={aiQuery.trim().length < 5 || aiSearch.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {aiSearch.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            Ask AI
          </button>
        </form>

        {/* AI Response */}
        {aiSearch.data && (
          <div className="mt-6 p-4 bg-gradient-to-r from-primary-50 to-purple-50 rounded-lg border border-primary-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <span className="font-semibold text-primary-900">AI Response</span>
            </div>
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown>{aiSearch.data.answer}</ReactMarkdown>
            </div>

            {aiSearch.data.suggestions?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-primary-200">
                <p className="text-sm font-medium text-primary-900 mb-2">Related suggestions:</p>
                <ul className="text-sm text-primary-700 space-y-1">
                  {aiSearch.data.suggestions.map((suggestion, i) => (
                    <li key={i}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {aiSearch.isError && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
            Failed to get AI response. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}

export default Search;
