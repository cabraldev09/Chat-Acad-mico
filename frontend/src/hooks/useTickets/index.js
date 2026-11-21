import { useState, useEffect } from "react";
import toastError from "../../errors/toastError";

import api from "../../services/api";

const useTickets = ({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    queueIds,
    withUnreadMessages,
    groups,
    communities,
    archived,
    historical,
    tagId,
    reloadKey,
    allQueues,
    attendantId,
    connectionId,
}) => {
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [tickets, setTickets] = useState([]);
    const [count, setCount] = useState(0);
    // a failed load is told apart from an empty inbox; retry() asks again
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        setLoading(true);
        setError(false);
        const delayDebounceFn = setTimeout(() => {
            const fetchTickets = async() => {
                try {
                    const { data } = await api.get("/tickets", {
                        params: {
                            searchParam,
                            pageNumber,
                            status,
                            date,
                            showAll,
                            queueIds,
                            withUnreadMessages,
                            groups,
                            communities,
                            archived,
                            historical,
                            tagId,
                            allQueues,
                            attendantId,
                            connectionId,
                        },
                    })
                    setTickets(data.tickets)

                    setHasMore(data.hasMore)
                    setCount(data.count)
                    setLoading(false)
                } catch (err) {
                    setLoading(false)
                    setError(true)
                    toastError(err)
                }
            }

            fetchTickets()
        }, 500)
        return () => clearTimeout(delayDebounceFn)
    }, [
        searchParam,
        pageNumber,
        status,
        date,
        showAll,
        queueIds,
        withUnreadMessages,
        groups,
        archived,
        historical,
        tagId,
        reloadKey,
        allQueues,
        attendantId,
        connectionId,
        attempt,
    ])

    return { tickets, loading, hasMore, count, error, retry: () => setAttempt((n) => n + 1) };
};

export default useTickets;