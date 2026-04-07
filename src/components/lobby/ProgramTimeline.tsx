import { CalendarIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline';

interface Session {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  room?: string;
  presentations: Presentation[];
}

interface Presentation {
  id: string;
  title: string;
  presenter: string;
  affiliation?: string;
  startTime: string;
  endTime: string;
}

interface ProgramTimelineProps {
  sessions: Session[];
  selectedPresenter?: string;
  onPresenterFilter?: (presenter: string | undefined) => void;
}

export default function ProgramTimeline({
  sessions,
  selectedPresenter,
  onPresenterFilter
}: ProgramTimelineProps) {
  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':');
    return `${hour}:${minute}`;
  };

  const filteredSessions = selectedPresenter
    ? sessions.map(session => ({
        ...session,
        presentations: session.presentations.filter(p =>
          p.presenter.toLowerCase().includes(selectedPresenter.toLowerCase())
        )
      })).filter(session => session.presentations.length > 0)
    : sessions;

  const getAllPresenters = () => {
    const presenters = new Set<string>();
    sessions.forEach(session => {
      session.presentations.forEach(presentation => {
        presenters.add(presentation.presenter);
      });
    });
    return Array.from(presenters).sort();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      {/* 필터 */}
      {onPresenterFilter && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              발표자 필터:
            </label>
            <select
              value={selectedPresenter || ''}
              onChange={(e) => onPresenterFilter(e.target.value || undefined)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">전체 발표자</option>
              {getAllPresenters().map(presenter => (
                <option key={presenter} value={presenter}>{presenter}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 타임라인 */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredSessions.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {selectedPresenter ? '해당 발표자의 발표가 없습니다.' : '등록된 세션이 없습니다.'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div key={session.id} className="p-6">
              {/* 세션 헤더 */}
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {session.title}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center">
                        <ClockIcon className="w-4 h-4 mr-1" />
                        {formatTime(session.startTime)} - {formatTime(session.endTime)}
                      </span>
                      {session.room && (
                        <span className="flex items-center">
                          <MapPinIcon className="w-4 h-4 mr-1" />
                          {session.room}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                    {session.presentations.length}개 발표
                  </span>
                </div>
              </div>

              {/* 발표 리스트 */}
              <div className="space-y-3 ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                {session.presentations.map((presentation) => (
                  <div
                    key={presentation.id}
                    className="relative pb-4 last:pb-0"
                  >
                    <div className="absolute left-[-21px] top-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white dark:border-gray-800"></div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {presentation.title}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {presentation.presenter}
                            {presentation.affiliation && (
                              <span className="ml-2">({presentation.affiliation})</span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-4">
                          {formatTime(presentation.startTime)} - {formatTime(presentation.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}