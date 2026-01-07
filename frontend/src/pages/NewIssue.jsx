import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { issuesApi, categoriesApi, equipmentApi } from '../services/api';
import { ArrowLeft, Save, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(500),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category_id: z.string().optional(),
  equipment_id: z.string().optional(),
});

function NewIssue() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 'medium',
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const response = await equipmentApi.getAll({ limit: 100 });
      return response.data.equipment;
    },
  });

  const createIssue = useMutation({
    mutationFn: (data) => issuesApi.create(data),
    onSuccess: (response) => {
      toast.success('Issue created successfully');
      navigate(`/issues/${response.data.issue.id}`);
    },
  });

  const onSubmit = (data) => {
    // Clean up empty optional fields
    if (!data.category_id) delete data.category_id;
    if (!data.equipment_id) delete data.equipment_id;
    createIssue.mutate(data);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Issue</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="label">Issue Title *</label>
          <input
            id="title"
            type="text"
            {...register('title')}
            className={`input ${errors.title ? 'input-error' : ''}`}
            placeholder="Brief description of the problem"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="label">Description *</label>
          <textarea
            id="description"
            {...register('description')}
            rows={6}
            className={`input ${errors.description ? 'input-error' : ''}`}
            placeholder="Provide detailed information about the issue:
- What were you trying to do?
- What happened instead?
- Any error messages?
- Steps to reproduce the problem"
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Priority */}
          <div>
            <label htmlFor="priority" className="label">Priority *</label>
            <select
              id="priority"
              {...register('priority')}
              className="input"
            >
              <option value="low">Low - Minor inconvenience</option>
              <option value="medium">Medium - Affects work but has workaround</option>
              <option value="high">High - Significant impact, needs attention</option>
              <option value="critical">Critical - System down, urgent fix needed</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category_id" className="label">Category</label>
            <select
              id="category_id"
              {...register('category_id')}
              className="input"
            >
              <option value="">Select a category</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div className="md:col-span-2">
            <label htmlFor="equipment_id" className="label">Related Equipment</label>
            <select
              id="equipment_id"
              {...register('equipment_id')}
              className="input"
            >
              <option value="">Select equipment (optional)</option>
              {equipment?.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} {eq.model && `- ${eq.model}`} {eq.location && `(${eq.location})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createIssue.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {createIssue.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Create Issue
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewIssue;
