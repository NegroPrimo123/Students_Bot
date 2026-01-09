'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import './globals.css';

interface Event {
  id: number;
  title: string;
  description: string;
  points_awarded: number;
  course: number;
  created_at: string;
  is_archived: boolean;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  group: string;
  course: number;
}

interface Participation {
  id: number;
  event: Event;
  student: Student;
  status: string;
  created_at: string;
}

interface Stats {
  totalEvents: number;
  activeEvents: number;
  totalParticipations: number;
  pendingParticipations: number;
}

interface Notification {
  message: string;
  type: 'success' | 'error';
}

interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface FormData {
  title: string;
  description: string;
  points_awarded: string;
  course: string;
}

export default function Home() {
  const router = useRouter();
  const API_BASE = 'http://localhost:3000';
  
  // Состояния авторизации
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });
  
  // Основные состояния
  const [activeTab, setActiveTab] = useState<string>('events');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [events, setEvents] = useState<Event[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalEvents: 0,
    activeEvents: 0,
    totalParticipations: 0,
    pendingParticipations: 0
  });
  const [notification, setNotification] = useState<Notification>({ message: '', type: 'success' });
  const [showCertificateModal, setShowCertificateModal] = useState<boolean>(false);
  const [certificateUrl, setCertificateUrl] = useState<string>('');
  const [adminInfo, setAdminInfo] = useState<any>(null);
  
  // Форма создания мероприятия
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    points_awarded: '',
    course: ''
  });

  // Проверка авторизации при загрузке
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const admin = localStorage.getItem('admin');
    
    if (token && admin) {
      setIsAuthenticated(true);
      setAdminInfo(JSON.parse(admin));
    } else {
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  }, []);

  // Авторизованный API запрос
  const apiRequest = async (endpoint: string, options: ApiOptions = {}) => {
    const token = localStorage.getItem('access_token');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers,
        ...options
      });

      if (response.status === 401) {
        // Сессия истекла
        localStorage.removeItem('access_token');
        localStorage.removeItem('admin');
        setIsAuthenticated(false);
        showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'error');
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      showNotification('Ошибка при загрузке данных', 'error');
      throw error;
    }
  };

  // Вход в систему
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Ошибка авторизации');
      }

      // Сохраняем токен и данные админа
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('admin', JSON.stringify(data.admin));
      
      setIsAuthenticated(true);
      setAdminInfo(data.admin);
      showNotification('Успешный вход!', 'success');
      
      // Загружаем данные
      loadEvents();
    } catch (error: any) {
      showNotification(error.message || 'Неверный email или пароль', 'error');
    }
  };

  // Выход из системы
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('admin');
    setIsAuthenticated(false);
    setAdminInfo(null);
    showNotification('Вы вышли из системы', 'success');
  };

  // Показать уведомление
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: 'success' }), 3000);
  };

  // Загрузить мероприятия
  const loadEvents = async (filter: string = 'all') => {
    try {
      let endpoint = '/events';
      
      if (filter === 'archived') {
        endpoint = '/events/archived';
      } else if (['1', '2', '3'].includes(filter)) {
        endpoint = `/events/course/${filter}`;
      } else if (filter === 'all') {
        endpoint = '/events/all';
      }
      
      const data = await apiRequest(endpoint);
      if (data) setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  // Загрузить участия
  const loadParticipations = async () => {
    try {
      const data = await apiRequest('/participations/pending');
      if (data) setParticipations(data);
    } catch (error) {
      console.error('Failed to load participations:', error);
    }
  };

  // Загрузить статистику
  const loadStatistics = async () => {
    try {
      const data = await apiRequest('/statistics/admin');
      if (data) {
        setStats({
          totalEvents: data.totalEvents || 0,
          activeEvents: data.activeEvents || 0,
          totalParticipations: data.totalParticipations || 0,
          pendingParticipations: data.pendingParticipations || 0
        });
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  // Показать сертификат
  const showCertificatePdf = async (participationId: number) => {
    try {
      showNotification('Открываем сертификат...', 'success');
      const certificateUrl = `${API_BASE}/participations/${participationId}/view-certificate`;
      window.open(certificateUrl, '_blank');
    } catch (error) {
      console.error('Failed to show certificate:', error);
      showNotification('Ошибка при открытии сертификата', 'error');
    }
  };

  // Создать мероприятие
  const createEvent = async (eventData: Omit<Event, 'id' | 'created_at' | 'is_archived'>) => {
    try {
      await apiRequest('/events', {
        method: 'POST',
        body: JSON.stringify(eventData)
      });
      
      showNotification('Мероприятие успешно создано!');
      setFormData({ title: '', description: '', points_awarded: '', course: '' });
      loadEvents();
    } catch (error) {
      console.error('Failed to create event:', error);
      showNotification('Ошибка при создании мероприятия', 'error');
    }
  };

  // Обновить статус участия
  const updateParticipationStatus = async (participationId: number, status: string) => {
    try {
      await apiRequest(`/participations/${participationId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      
      showNotification('Статус участия обновлен!');
      loadParticipations();
    } catch (error) {
      console.error('Failed to update participation status:', error);
      showNotification('Ошибка при обновлении статуса', 'error');
    }
  };

  // Архивировать мероприятие
  const archiveEvent = async (eventId: number) => {
    try {
      await apiRequest(`/events/${eventId}/archive`, {
        method: 'PATCH'
      });
      
      showNotification('Мероприятие архивировано!');
      loadEvents();
    } catch (error) {
      console.error('Failed to archive event:', error);
      showNotification('Ошибка при архивировании мероприятия', 'error');
    }
  };

  // Восстановить мероприятие
  const restoreEvent = async (eventId: number) => {
    try {
      await apiRequest(`/events/${eventId}/restore`, {
        method: 'PATCH'
      });
      
      showNotification('Мероприятие восстановлено!');
      loadEvents();
    } catch (error) {
      console.error('Failed to restore event:', error);
      showNotification('Ошибка при восстановлении мероприятия', 'error');
    }
  };

  // Отправить форму создания мероприятия
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createEvent({
      title: formData.title,
      description: formData.description,
      points_awarded: parseInt(formData.points_awarded),
      course: parseInt(formData.course)
    });
  };

  // Изменить форму
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value
    });
  };

  // Изменить форму входа
  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLoginForm({
      ...loginForm,
      [e.target.id]: e.target.value
    });
  };

  // Загрузить данные при смене вкладки
  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'events') {
        loadEvents(activeFilter);
      } else if (activeTab === 'participations') {
        loadParticipations();
      } else if (activeTab === 'statistics') {
        loadStatistics();
      }
    }
  }, [activeTab, activeFilter, isAuthenticated]);

  // Если загружается
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f5f5f5'
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  // Если не авторизован - показать форму входа
  if (!isAuthenticated) {
    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <div className={styles.loginHeader}>
            <h1>Панель администратора</h1>
            <p>Войдите в систему для управления мероприятиями</p>
          </div>

          {notification.message && (
            <div className={`${styles.notification} ${styles[notification.type]}`}>
              {notification.message}
            </div>
          )}

          <form onSubmit={handleLogin} className={styles.loginForm}>
            <div className={styles.formGroup}>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={loginForm.email}
                onChange={handleLoginChange}
                placeholder="admin@college.edu"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Пароль</label>
              <input
                type="password"
                id="password"
                value={loginForm.password}
                onChange={handleLoginChange}
                placeholder="Введите пароль"
                required
              />
            </div>

            <button type="submit" className={styles.loginButton}>
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Основной интерфейс (авторизован)
  return (
    <div>
      {/* Уведомление */}
      {notification.message && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      {/* Шапка */}
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.headerContent}>
            <div className={styles.logo}>Student Events Admin</div>
            
            <div className={styles.userInfo}>
              <span>{adminInfo?.full_name}</span>
              <button onClick={handleLogout} className={styles.logoutButton}>
                Выйти
              </button>
            </div>

            <nav className={styles.nav}>
              <ul>
                {['events', 'create-event', 'statistics', 'participations'].map(tab => (
                  <li key={tab}>
                    <a 
                      href="#" 
                      className={`${styles.navLink} ${activeTab === tab ? styles.active : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab(tab);
                      }}
                    >
                      {tab === 'events' && 'Мероприятия'}
                      {tab === 'create-event' && 'Создать'}
                      {tab === 'statistics' && 'Статистика'}
                      {tab === 'participations' && 'Участия'}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </header>

      <main className={`${styles.container} ${styles.main}`}>
        {/* Вкладка мероприятий */}
        {activeTab === 'events' && (
          <div className={styles.tabContent}>
            <h2 className={styles.sectionTitle}>Мероприятия</h2>
            
            <div className={styles.tabs}>
              {['all', '1', '2', '3', 'archived'].map(filter => (
                <div 
                  key={filter}
                  className={`${styles.tab} ${activeFilter === filter ? styles.active : ''}`}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter === 'all' && 'Все'}
                  {filter === 'archived' && 'Архив'}
                  {['1', '2', '3'].includes(filter) && `${filter} курс`}
                </div>
              ))}
            </div>
            
            <div className={styles.eventsGrid}>
              {events.length === 0 ? (
                <p>Мероприятия не найдены</p>
              ) : (
                events.map(event => (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventHeader}>
                      <h3 className={styles.eventTitle}>{event.title}</h3>
                    </div>
                    <div className={styles.eventBody}>
                      <p className={styles.eventDescription}>{event.description}</p>
                      <div className={styles.eventDetails}>
                        <span className={styles.eventPoints}>{event.points_awarded} баллов</span>
                        <span className={styles.eventCourse}>{event.course} курс</span>
                      </div>
                      <p><small>Создано: {new Date(event.created_at).toLocaleDateString()}</small></p>
                      {event.is_archived ? (
                        <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => restoreEvent(event.id)}>
                          Восстановить
                        </button>
                      ) : (
                        <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => archiveEvent(event.id)}>
                          Архивировать
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Вкладка создания мероприятия */}
        {activeTab === 'create-event' && (
          <div className={styles.tabContent}>
            <h2 className={styles.sectionTitle}>Создать мероприятие</h2>
            
            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="title">Название мероприятия</label>
                <input 
                  type="text" 
                  id="title" 
                  className={styles.formControl} 
                  value={formData.title}
                  onChange={handleChange}
                  required 
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="description">Описание</label>
                <textarea 
                  id="description" 
                  className={styles.formControl} 
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  required
                ></textarea>
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="points_awarded">Награждаемые баллы</label>
                <input 
                  type="number" 
                  id="points_awarded" 
                  className={styles.formControl} 
                  min="1" 
                  value={formData.points_awarded}
                  onChange={handleChange}
                  required 
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="course">Курс</label>
                <select 
                  id="course" 
                  className={styles.formControl} 
                  value={formData.course}
                  onChange={handleChange}
                  required
                >
                  <option value="">Выберите курс</option>
                  <option value="1">1 курс</option>
                  <option value="2">2 курс</option>
                  <option value="3">3 курс</option>
                </select>
              </div>
              
              <button type="submit" className={styles.btn}>Создать мероприятие</button>
            </form>
          </div>
        )}

        {/* Вкладка статистики */}
        {activeTab === 'statistics' && (
          <div className={styles.tabContent}>
            <h2 className={styles.sectionTitle}>Статистика</h2>
            
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.totalEvents}</div>
                <div className={styles.statLabel}>Всего мероприятий</div>
              </div>
              
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.activeEvents}</div>
                <div className={styles.statLabel}>Активных мероприятий</div>
              </div>
              
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.totalParticipations}</div>
                <div className={styles.statLabel}>Всего участий</div>
              </div>
              
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.pendingParticipations}</div>
                <div className={styles.statLabel}>Ожидают проверки</div>
              </div>
            </div>
          </div>
        )}

        {/* Вкладка участий */}
        {activeTab === 'participations' && (
          <div className={styles.tabContent}>
            <h2 className={styles.sectionTitle}>Участия ожидающие проверки</h2>
            
            <div className={styles.participationsContainer}>
              {participations.length === 0 ? (
                <p>Участия ожидающие проверки не найдены</p>
              ) : (
                participations.map(participation => (
                  <div key={participation.id} className={styles.participationCard}>
                    <h3>{participation.event.title}</h3>
                    <p><strong>Студент:</strong> {participation.student.first_name} {participation.student.last_name}</p>
                    <p><strong>Группа:</strong> {participation.student.group}</p>
                    <p><strong>Курс:</strong> {participation.student.course}</p>
                    <p><strong>Статус:</strong> {participation.status}</p>
                    <p><strong>Дата подачи:</strong> {new Date(participation.created_at).toLocaleDateString()}</p>
                    
                    <div className={styles.certificatePreview}>
                      <p><strong>Сертификат:</strong></p>
                      <button 
                        className={`${styles.btn} ${styles.btnWarning}`}
                        onClick={() => showCertificatePdf(participation.id)}
                      >
                        Просмотреть сертификат (PDF)
                      </button>
                    </div>
                    
                    <div className={styles.certificateActions}>
                      <button 
                        className={`${styles.btn} ${styles.btnSuccess}`}
                        onClick={() => updateParticipationStatus(participation.id, 'approved')}
                      >
                        Одобрить
                      </button>
                      <button 
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={() => updateParticipationStatus(participation.id, 'rejected')}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Модальное окно для сертификата */}
        {showCertificateModal && (
          <div className={styles.modal} onClick={() => setShowCertificateModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowCertificateModal(false)}>
                &times;
              </button>
              <h3>Просмотр сертификата</h3>
              <img src={certificateUrl} alt="Сертификат" className={styles.modalImage} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}