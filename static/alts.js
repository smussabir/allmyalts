var alts = [];
var summary = {};
var currentView = 'cards';
var lastSortedColumn = null;
var lastSortDirection = 'asc';

$(document).ready(function() {
    var ajaxTime = Date.now();
    var secs = 0;
    var mins = 0;
    $('.load-timer').html(secs + 's');
    var maxWait = 15;

    // Timer and progress bar simulation
    var timer = setInterval(function () {
        secs = secs + 1;
        if (secs > 59) {
            mins = mins + 1;
            secs = 0;
        }
        if (mins < 1) {
            $('.load-timer').html(secs + 's');
        } else {
            $('.load-timer').html(mins + 'm' + ' ' + secs + 's');
        }

        // Progress bar: fake until done
        var progressPercent = Math.min((secs / maxWait) * 100, 99);
        $('.progress-bar').css('width', progressPercent + '%');
    },1000);

    // SSE for status updates
    if (!!window.EventSource) {
        var source = new EventSource('/updates');
        source.onmessage = function(e) {
            // Replace status with new message
            $('.status-updates').text(e.data);
        };
        source.onerror = function(e) {
            console.error("SSE error", e);
            source.close();
        };
    } else {
        console.log("Your browser doesn't support SSE.");
    }

    // AJAX call to get alts
    $.ajax({
        type: "POST",
        url: "/get_alts"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        console.log("Total load time:", totalTime);

        // Request complete, finalize loader
        clearInterval(timer);
        $('.progress-bar').css('width', '100%');

        localStorage.clear();
        alts = response[0];
        summary = response[1];

        // Render cards initially
        renderCardView();

        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();

        // Sort functionality on dropdown change
        $('#sort-selector, #sort-direction').on('change', function() {
            var sortBy = $('#sort-selector').val();
            var direction = $('#sort-direction').val();
            sortAlts(sortBy, direction);
        });

        // Toggle view button
        // Starting in card view, show the table icon to switch to table view
        $('#toggle-view').html('<i class="fa-solid fa-list-ul"></i>');
        $('#toggle-view').on('click', function() {
            if (currentView === 'cards') {
                // Switch to table view
                currentView = 'table';
                // Replace icon with card icon to indicate toggling back
                $(this).html('<i class="fa-solid fa-table-cells"></i>');
                renderTableView();
            } else {
                // Switch to card view
                currentView = 'cards';
                // Replace icon with table icon to indicate toggling to table
                $(this).html('<i class="fa-solid fa-list-ul"></i>');
                renderCardView();
            }
        });


        $(document).on('click', '.icon', function () {
            // Get the filter value from the clicked icon
            const altFilter = '.' + $(this).attr('data-filter');
        
            // Retrieve existing filters from localStorage or initialize an empty array
            let filters = JSON.parse(localStorage.getItem('altFilters')) || [];
        
            // Add or remove the clicked filter
            const filterIndex = filters.indexOf(altFilter);
            if (filterIndex === -1) {
                filters.push(altFilter); // Add filter if not present
            } else {
                filters.splice(filterIndex, 1); // Remove filter if already present
            }
        
            // Apply filters or show all articles if no filters remain
            if (filters.length > 0) {
                localStorage.setItem('altFilters', JSON.stringify(filters));
        
                // Build a compound selector for all active filters
                const compoundFilter = filters.join(',');
        
                // Show filtered elements with fadeIn, and hide non-matching elements
                $('#alts > article').each(function () {
                    const $article = $(this);
                    if ($article.is(compoundFilter)) {
                        $article.stop(true, true).fadeIn(2000); // Show with fade-in
                    } else {
                        $article.stop(true, true).fadeOut(200); // Hide quickly
                    }
                });
            } else {
                localStorage.removeItem('altFilters');
        
                // No filters active, show all articles with fadeIn
                $('#alts > article').stop(true, true).fadeIn(2000);
            }
        });
        
        // Default sort: by level desc, then by name asc on ties
        lastSortedColumn = 'level';
        lastSortDirection = 'desc';
        sortAlts('level', 'desc');
    });
});

function formatLastLogin(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    const diffInMs = now - date;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays < 7) {
        return `${diffInDays} days ago at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
}

function sortAlts(property, direction) {
    alts.sort(function(a, b) {
        let valA = a[property];
        let valB = b[property];

        if (property === 'last_login') {
            // Convert the date strings to timestamps
            valA = Date.parse(valA);
            valB = Date.parse(valB);
        } else {
            // Normalize strings
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            // Convert to number if it's a numeric field
            if (property === 'achievement_points' || property === 'average_item_level' || property === 'gold' || property === 'level') {
                valA = Number(valA);
                valB = Number(valB);
            }
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;

        // Secondary comparison by name
        if (property !== 'name' && property !== 'last_login') {
            let nameA = a.name.toLowerCase();
            let nameB = b.name.toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }

        return 0;
    });

    if (currentView === 'cards') {
        renderCardView();
    } else {
        renderTableView();
    }
}

function renderCardView() {
    $('#alts').empty();
    $('#alts').css('display', 'none'); // reset layout

    var card = $(createSummaryCard(summary));
    $(card).appendTo('#alts');

    $.each(alts, function(i, alt) {
        var card = $(createCard(alt));
        $(card).appendTo('#alts');
    });

    // Set display to grid for card layout (adjust if your CSS expects another layout)
    $('#alts').css('display', 'grid');
    $('#alts').fadeIn(1000);
    $('#alts > article').show();
}

function renderTableView() {
    $('#alts').empty();
    $('#alts').css('display', 'none');

    var table = `
    <table id="alts-table">
        <thead>
            <tr>
                <th data-sort-property="name">Name</th>
                <th data-sort-property="realm">Realm</th>
                <th data-sort-property="gender">Gender</th>
                <th data-sort-property="race">Race</th>
                <th data-sort-property="class">Class</th>
                <th data-sort-property="spec">Spec</th>
                <th data-sort-property="level">Level</th>
                <th data-sort-property="achievement_points">Achievement Points</th>
                <th data-sort-property="average_item_level">Item Level</th>
                <th data-sort-property="gold">Gold</th>
                <th data-sort-property="location">Location</th>
                <th data-sort-property="last_login">Last Login</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>`;

    $('#alts').append(table);

    $.each(alts, function(i, alt) {
        let altClass = alt.class.toLowerCase().replace(' ', '');
        let altSpec = '';
        if ('spec' in alt) {
            altSpec = alt.spec.toLowerCase().replace(' ', '');
        }
        let altFaction = alt.faction.toLowerCase();
        let goldFormatted = Intl.NumberFormat().format(alt.gold) + 'g ' + alt.silver + 's ' + alt.copper + 'c';
        let formattedLastLogin = formatLastLogin(alt.last_login);
        if (formattedLastLogin == 'Invalid Date') {
            formattedLastLogin = '';
        }
        $('#alts-table tbody').append(`
            <tr class="${altFaction}">
                <td class="${altClass}">${alt.name}</td>
                <td>${alt.realm}</td>
                <td>${alt.gender}</td>
                <td>${alt.race}</td>
                <td class="${altClass}">${alt.class}</td>
                <td class="${altSpec}">${altSpec}</td>
                <td>${alt.level}</td>
                <td>${alt.achievement_points}</td>
                <td>${alt.average_item_level}</td>
                <td class="money"><span class="gold">${ Intl.NumberFormat().format(alt.gold) }</span> <span class="silver">${ alt.silver }</span> <span class="copper">${ alt.copper }</span></td>
                <td>${alt.location}</td>
                <td>${formattedLastLogin}</td>
            </tr>
        `);
    });

    // Click handler for sorting columns
    $('#alts-table thead th').off('click').on('click', function() {
        var property = $(this).data('sort-property');
        if (property === lastSortedColumn) {
            lastSortDirection = (lastSortDirection === 'asc') ? 'desc' : 'asc';
        } else {
            lastSortedColumn = property;
            lastSortDirection = 'asc';
        }
        sortAlts(property, lastSortDirection);
    });

    // Remove old indicators
    $('#alts-table thead th').each(function(){
        var text = $(this).text();
        $(this).html(text); // resets to just the original text
    });

    // Add Font Awesome icon to the currently sorted column
    if (lastSortedColumn) {
        var sortedTh = $('#alts-table thead th[data-sort-property="' + lastSortedColumn + '"]');
        if (sortedTh.length) {
            // Choose icon based on direction
            var icon = (lastSortDirection === 'asc') ? '<i class="fa-solid fa-arrow-up"></i>' : '<i class="fa-solid fa-arrow-down"></i>';
            // Append icon to the existing header text
            var currentText = sortedTh.text();
            sortedTh.html(currentText + ' ' + icon);
        }
    }

    $('#alts').css('display', 'block').fadeIn(1000);
}

function createCard(alt) {
    let altClass = alt.class.toLowerCase().replace(' ', '');
    let altFaction = alt.faction.toLowerCase();
    let altLevel = '';
    if (alt.level < 80) {
        altLevel = `<p class="card-text level-icon ${altClass} ${altClass}-border">${ alt.level }</p>`;
    }
    altLocation = alt.location
    if (altLocation == '') {
        altLocation = 'unknown';
    }
    let formattedLastLogin = formatLastLogin(alt.last_login);
    if (formattedLastLogin == 'Invalid Date') {
        formattedLastLogin = '';
    }

    let card = `
    <article class="alt card ${altClass} ${altFaction}" style="background-image: url('${alt.main_image}')">    
        <div class="card-body">
            <h1 class="card-title ${altClass}">${ alt.name }</h1>
            <dl>
                <dt>Realm</dt>
                <dd>${ alt.realm }</dd>
                <dt>Gender Race</dt>
                <dd>${ alt.gender } ${ alt.race }</dd>
                <dt>Class</dt>
                <dd>${ alt.class }</dd>
                <dt>Achievement Points</dt>
                <dd>${ alt.achievement_points }</dd>
                <dt>Average Item Level</dt>
                <dd>${ alt.average_item_level }</dd>
            </dl>
            <dl>
                <dt>Gold</dt>
                <dd class="money"><span class="gold">${ Intl.NumberFormat().format(alt.gold) }</span> <span class="silver">${ alt.silver }</span> <span class="copper">${ alt.copper }</span></dd>
                <dt>Location</dt>
                <dd>${ altLocation }</dd>
            </dl>
    `;

    if (alt.professions.length > 0) {
        card += `<dl class="professions">`;
        $.each(alt.professions, function(i, profession) {
            let progress = (profession.skill_points / profession.max_skill_points) * 100;
            card += `
                <dt>Professions</dt>
                <dd>${ profession.name }<div class="progress-bar tooltip bottom" data-tooltip="${ profession.tier } ${profession.skill_points}/${profession.max_skill_points}"><span class="progress" style="width: ${ progress }%"></span></div></dd>
            `;
        });
        card += `</dl>`;
    }

    card += `
            <div class="card-footer">
                <p class="alt-id">${ alt.character_id }</p>
                <p class="last-login">${formattedLastLogin}</p>
            </div>
            <div class="alt-icons">
                <img class="icon faction-icon ${altFaction}-icon" data-filter="${altFaction}" src="/static/images/${altFaction}.png" alt="${alt.faction} icon">
                <img class="icon class-icon" data-filter="${altClass}" src="/static/flatborder/${altClass}_flatborder.png" alt="${alt.class} icon">
                ${altLevel}
            </div>
        </div>
    </article>
    `;
    return card;
}

function createSummaryCard(summary) {
    let card = `
    <article class="alt card summary">    
        <div class="card-body">
            <h1 class="card-title summary">Summary</h1>
            <dl>
                <dt>Battletag</dt>
                <dd class="card-text realm">${ summary.battletag }</dd>
                <dt>Number of accounts</dt>
                <dd class="card-text realm">${ summary.accounts }</dd>
                <dt>Number of alts</dt>
                <dd class="card-text realm">${ summary.number_alts }</dd>
                <dt>Total Gold</dt>
                <dd class="money"><span class="gold">${ Intl.NumberFormat().format(summary.gold) }</span> <span class="silver">${ summary.silver }</span> <span class="copper">${ summary.copper }</span></dd>
            </dl>
        </div>
    </article>
    `;
    return card;
}

$("a[href='#top']").click(function() {
    $('html, body').animate({ scrollTop: 0 }, 1200);
    return false;
});