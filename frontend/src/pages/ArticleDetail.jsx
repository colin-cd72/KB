import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { articlesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, Calendar, User, Eye, Folder, Monitor, Edit,
  Star, FileText, Clock
} from 'lucide-react';
import { format } from 'date-fns';

function ArticleDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  const { data: article, isLoading, error } = useQuery({
    queryKey: ['article', slug],
    queryFn: async () => {
      const response = await articlesApi.getBySlug(slug);
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-dark-100 rounded w-3/4 mb-4" />
        <div className="h-4 bg-dark-100 rounded w-1/2 mb-8" />
        <div className="space-y-4">
          <div className="h-4 bg-dark-100 rounded w-full" />
          <div className="h-4 bg-dark-100 rounded w-full" />
          <div className="h-4 bg-dark-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <FileText className="w-16 h-16 text-dark-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-700 mb-2">Article not found</h2>
        <p className="text-dark-500 mb-6">The article you're looking for doesn't exist or has been removed.</p>
        <Link to="/articles" className="btn btn-primary">
          Browse Articles
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-dark-500 hover:text-dark-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        {canEdit && (
          <Link
            to={`/articles/${article.id}/edit`}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Article
          </Link>
        )}
      </div>

      {/* Article Header */}
      <article className="card overflow-hidden">
        <div className="p-8 border-b border-dark-100">
          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {article.is_featured && (
              <span className="inline-flex items-center gap-1 bg-warning-100 text-warning-700 px-3 py-1 rounded-full text-sm font-medium">
                <Star className="w-4 h-4 fill-current" />
                Featured
              </span>
            )}
            {!article.is_published && (
              <span className="inline-flex items-center gap-1 bg-dark-100 text-dark-600 px-3 py-1 rounded-full text-sm font-medium">
                Draft
              </span>
            )}
            {article.category_name && (
              <span className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-sm">
                <Folder className="w-4 h-4" />
                {article.category_name}
              </span>
            )}
            {article.equipment_name && (
              <span className="inline-flex items-center gap-1 bg-dark-50 text-dark-600 px-3 py-1 rounded-full text-sm">
                <Monitor className="w-4 h-4" />
                {article.equipment_name}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-dark-900 mb-4">
            {article.title}
          </h1>

          {/* Summary */}
          {article.summary && (
            <p className="text-lg text-dark-600 mb-6">
              {article.summary}
            </p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-dark-500">
            <span className="inline-flex items-center gap-2">
              <User className="w-4 h-4" />
              {article.author_name}
            </span>
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(article.created_at), 'MMMM d, yyyy')}
            </span>
            {article.updated_at !== article.created_at && (
              <span className="inline-flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Updated {format(new Date(article.updated_at), 'MMM d, yyyy')}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <Eye className="w-4 h-4" />
              {article.view_count} views
            </span>
          </div>
        </div>

        {/* Article Content */}
        <div className="p-8">
          <div className="prose prose-lg max-w-none prose-headings:text-dark-900 prose-p:text-dark-600 prose-a:text-primary-600 prose-strong:text-dark-800 prose-code:bg-dark-50 prose-code:px-1 prose-code:rounded prose-pre:bg-dark-800 prose-pre:text-dark-100 prose-img:rounded-lg prose-img:shadow-md">
            <ReactMarkdown
              components={{
                img: ({ node, ...props }) => (
                  <img {...props} className="max-w-full h-auto rounded-lg shadow-md" loading="lazy" />
                ),
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
                pre: ({ node, children, ...props }) => (
                  <pre {...props} className="bg-dark-800 text-dark-100 p-4 rounded-lg overflow-x-auto">
                    {children}
                  </pre>
                ),
                code: ({ node, inline, ...props }) => (
                  inline
                    ? <code {...props} className="bg-dark-100 text-dark-800 px-1.5 py-0.5 rounded text-sm" />
                    : <code {...props} />
                ),
              }}
            >
              {article.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Article Images */}
        {article.images && article.images.length > 0 && (
          <div className="p-8 border-t border-dark-100 bg-dark-50">
            <h3 className="text-lg font-semibold text-dark-900 mb-4">Attachments</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {article.images.map((image) => (
                <a
                  key={image.id}
                  href={image.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <img
                    src={image.file_path}
                    alt={image.alt_text || 'Article image'}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Related Articles */}
      {article.related_articles && article.related_articles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-dark-900 mb-4">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {article.related_articles.map((related) => (
              <Link
                key={related.id}
                to={`/articles/${related.slug}`}
                className="card p-4 hover:shadow-md transition-shadow group"
              >
                <h3 className="font-medium text-dark-900 group-hover:text-primary-600 transition-colors line-clamp-2">
                  {related.title}
                </h3>
                {related.summary && (
                  <p className="text-sm text-dark-500 mt-2 line-clamp-2">
                    {related.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Back to Articles */}
      <div className="mt-8 text-center">
        <Link to="/articles" className="text-primary-600 hover:text-primary-700 font-medium">
          Browse all articles
        </Link>
      </div>
    </div>
  );
}

export default ArticleDetail;
